import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  WhatsappConnection,
  ConnectionStatus,
} from './entities/whatsapp-connection.entity';
import {
  WhatsappMessage,
  MessageDirection,
  MessageStatus,
} from './entities/whatsapp-message.entity';
import { EventEmitter } from 'events';

@Injectable()
export class WhatsappEvolutionService
  extends EventEmitter
  implements OnModuleDestroy
{
  private readonly logger = new Logger(WhatsappEvolutionService.name);
  private readonly apiUrl: string;
  private readonly globalApiKey: string;
  private readonly webhookUrl: string;

  /** In-memory cache: tenantId → { instanceName, instanceToken, status } */
  private instances = new Map<
    string,
    {
      instanceName: string;
      instanceToken: string;
      status: ConnectionStatus;
      qrCode: string | null;
    }
  >();

  constructor(
    private configService: ConfigService,
    @InjectRepository(WhatsappConnection)
    private connectionRepo: Repository<WhatsappConnection>,
    @InjectRepository(WhatsappMessage)
    private messageRepo: Repository<WhatsappMessage>,
  ) {
    super();
    this.apiUrl = this.configService.get(
      'EVOLUTION_API_URL',
      'http://localhost:8080',
    );
    this.globalApiKey = this.configService.get('EVOLUTION_API_KEY', '');
    this.webhookUrl = this.configService.get('EVOLUTION_WEBHOOK_URL', '');
  }

  async onModuleDestroy() {
    this.instances.clear();
  }

  // ── Restore active connections on startup ──

  async restoreConnections() {
    const active = await this.connectionRepo.find({
      where: { status: ConnectionStatus.CONNECTED },
    });

    for (const conn of active) {
      if (!conn.instanceName || !conn.instanceToken) continue;

      this.logger.log(
        `Restoring instance ${conn.instanceName} for tenant ${conn.tenantId}`,
      );

      try {
        const state = await this.fetchConnectionState(
          conn.instanceName,
          conn.instanceToken,
        );
        const status =
          state === 'open'
            ? ConnectionStatus.CONNECTED
            : ConnectionStatus.DISCONNECTED;

        this.instances.set(conn.tenantId, {
          instanceName: conn.instanceName,
          instanceToken: conn.instanceToken,
          status,
          qrCode: null,
        });

        if (status !== ConnectionStatus.CONNECTED) {
          await this.connectionRepo.update(conn.id, { status });
        }
      } catch (err) {
        this.logger.error(
          `Failed to restore ${conn.tenantId}: ${err.message}`,
        );
        this.instances.set(conn.tenantId, {
          instanceName: conn.instanceName,
          instanceToken: conn.instanceToken,
          status: ConnectionStatus.DISCONNECTED,
          qrCode: null,
        });
      }
    }
  }

  // ── Connect / create instance ──

  async connect(
    tenantId: string,
    connectionId: string,
  ): Promise<string | null> {
    const existing = this.instances.get(tenantId);
    const conn = await this.connectionRepo.findOne({
      where: { id: connectionId },
    });
    if (!conn) throw new Error('Conexão não encontrada');

    const instanceName = existing?.instanceName || `governeai_${tenantId.replace(/-/g, '').slice(0, 16)}`;

    // Try to get instanceToken from: in-memory cache → DB → Evolution API fetch
    let instanceToken = existing?.instanceToken || conn.instanceToken || '';

    // If we don't have the token locally, check if instance exists in Evolution
    if (!instanceToken) {
      const fetched = await this.fetchExistingInstance(instanceName);
      if (fetched) {
        instanceToken = fetched.token;
        this.logger.log(
          `Found existing Evolution instance ${instanceName}, recovered token`,
        );
      }
    }

    // If instance exists (we have a token), try to reconnect
    if (instanceToken) {
      try {
        const state = await this.fetchConnectionState(
          instanceName,
          instanceToken,
        );

        // Configure webhook (may have been lost)
        await this.configureWebhook(instanceName, instanceToken, tenantId);

        // Save token to DB if not already saved
        await this.connectionRepo.update(connectionId, {
          instanceName,
          instanceToken,
          status: ConnectionStatus.PENDING,
        });

        this.instances.set(tenantId, {
          instanceName,
          instanceToken,
          status: state === 'open' ? ConnectionStatus.CONNECTED : ConnectionStatus.PENDING,
          qrCode: null,
        });

        if (state === 'open') {
          return null; // Already connected
        }

        // Instance exists but not connected, get QR code
        const qrCode = await this.fetchQrCode(instanceName, instanceToken);
        const inst = this.instances.get(tenantId);
        if (inst) inst.qrCode = qrCode;

        if (qrCode) {
          this.emit('qr', { tenantId, qrCode });
        }
        return qrCode;
      } catch (err) {
        this.logger.warn(
          `Existing instance ${instanceName} unreachable: ${err.message}, will recreate`,
        );
        // Instance may have been deleted, fall through to create
      }
    }

    // Create new instance in Evolution API
    const result = await this.createInstance(instanceName);
    const newToken = result.hash?.apikey || result.token || '';

    // Configure webhook for this instance
    await this.configureWebhook(instanceName, newToken, tenantId);

    // Save to DB
    await this.connectionRepo.update(connectionId, {
      instanceName,
      instanceToken: newToken,
      status: ConnectionStatus.PENDING,
    });

    this.instances.set(tenantId, {
      instanceName,
      instanceToken: newToken,
      status: ConnectionStatus.PENDING,
      qrCode: null,
    });

    // Fetch QR code
    const qrCode = await this.fetchQrCode(instanceName, newToken);
    const inst = this.instances.get(tenantId);
    if (inst) inst.qrCode = qrCode;

    if (qrCode) {
      this.emit('qr', { tenantId, qrCode });
    }

    return qrCode;
  }

  // ── Send message ──

  async sendMessage(
    tenantId: string,
    phone: string,
    content: string,
    quotedId?: string,
  ) {
    const inst = this.instances.get(tenantId);
    if (!inst || inst.status !== ConnectionStatus.CONNECTED) {
      throw new Error('WhatsApp não conectado');
    }

    const normalizedPhone = this.normalizePhone(phone);

    const body: any = {
      number: normalizedPhone,
      text: content,
    };

    if (quotedId) {
      body.quoted = {
        key: {
          id: quotedId,
          remoteJid: `${normalizedPhone}@s.whatsapp.net`,
        },
      };
    }

    const response = await this.apiCall(
      'POST',
      `/message/sendText/${inst.instanceName}`,
      body,
      inst.instanceToken,
    );

    // Look up existing remoteName for this contact
    const existingMsg = await this.messageRepo.findOne({
      where: { tenantId, remotePhone: normalizedPhone },
      select: ['remoteName'],
      order: { createdAt: 'DESC' },
    });

    const conn = await this.connectionRepo.findOne({
      where: { tenantId },
    });

    const entity = this.messageRepo.create({
      tenantId,
      connectionId: conn?.id || '',
      remoteJid: `${normalizedPhone}@s.whatsapp.net`,
      remotePhone: normalizedPhone,
      remoteName: existingMsg?.remoteName || undefined,
      content,
      type: 'text',
      direction: MessageDirection.OUTBOUND,
      status: MessageStatus.SENT,
      externalId: response?.key?.id || undefined,
    });

    return this.messageRepo.save(entity);
  }

  // ── Broadcast ──

  async broadcast(tenantId: string, phones: string[], content: string) {
    const results: { phone: string; success: boolean; error?: string }[] = [];

    for (const phone of phones) {
      try {
        await this.sendMessage(tenantId, phone, content);
        results.push({ phone, success: true });
        // Rate limit: 1.5-3s delay between messages
        await this.delay(1500 + Math.random() * 1500);
      } catch (err) {
        results.push({ phone, success: false, error: err.message });
      }
    }

    return {
      total: phones.length,
      sent: results.filter((r) => r.success).length,
      failed: results.filter((r) => !r.success).length,
      results,
    };
  }

  // ── Disconnect ──

  async disconnect(tenantId: string) {
    const inst = this.instances.get(tenantId);
    if (!inst) return;

    try {
      await this.apiCall(
        'DELETE',
        `/instance/logout/${inst.instanceName}`,
        null,
        inst.instanceToken,
      );
    } catch (err) {
      this.logger.warn(`Logout failed for tenant ${tenantId}: ${err.message}`);
    }

    try {
      await this.apiCall(
        'DELETE',
        `/instance/delete/${inst.instanceName}`,
        null,
        this.globalApiKey,
      );
    } catch (err) {
      this.logger.warn(
        `Delete instance failed for ${tenantId}: ${err.message}`,
      );
    }

    this.instances.delete(tenantId);

    const conn = await this.connectionRepo.findOne({ where: { tenantId } });
    if (conn) {
      await this.connectionRepo.update(conn.id, {
        status: ConnectionStatus.DISCONNECTED,
        instanceName: undefined,
        instanceToken: undefined,
      });
    }

    this.emit('disconnected', { tenantId, loggedOut: true });
  }

  // ── Status ──

  getStatus(tenantId: string) {
    const inst = this.instances.get(tenantId);
    if (!inst) return { status: 'DISCONNECTED' as const, qrCode: null };
    return { status: inst.status, qrCode: inst.qrCode };
  }

  isConnected(tenantId: string): boolean {
    return this.instances.get(tenantId)?.status === ConnectionStatus.CONNECTED;
  }

  // ── Webhook Handlers ──

  async handleWebhook(
    tenantId: string,
    event: string,
    data: any,
  ) {
    this.logger.log(`Webhook [${event}] for tenant ${tenantId}`);

    switch (event) {
      case 'QRCODE_UPDATED':
        await this.handleQrCodeUpdate(tenantId, data);
        break;
      case 'CONNECTION_UPDATE':
        await this.handleConnectionUpdate(tenantId, data);
        break;
      case 'MESSAGES_UPSERT':
        await this.handleMessagesUpsert(tenantId, data);
        break;
      case 'MESSAGES_UPDATE':
        await this.handleMessagesUpdate(tenantId, data);
        break;
    }
  }

  private async handleQrCodeUpdate(tenantId: string, data: any) {
    const qrCode = data?.qrcode?.base64 || data?.qrcode;
    const inst = this.instances.get(tenantId);
    if (inst && qrCode) {
      inst.qrCode = qrCode;
      inst.status = ConnectionStatus.PENDING;
      this.emit('qr', { tenantId, qrCode });
    }
  }

  private async handleConnectionUpdate(tenantId: string, data: any) {
    const state = data?.state || data?.status;
    const inst = this.instances.get(tenantId);
    if (!inst) return;

    if (state === 'open') {
      inst.status = ConnectionStatus.CONNECTED;
      inst.qrCode = null;

      const conn = await this.connectionRepo.findOne({ where: { tenantId } });
      if (conn) {
        // Fetch instance info to get phone number
        try {
          const info = await this.apiCall(
            'GET',
            `/instance/fetchInstances?instanceName=${inst.instanceName}`,
            null,
            this.globalApiKey,
          );
          const instance = Array.isArray(info) ? info[0] : info;
          const phoneNumber =
            instance?.instance?.owner?.split('@')[0] || conn.phoneNumber;
          const pushName = instance?.instance?.profileName || conn.pushName;

          await this.connectionRepo.update(conn.id, {
            status: ConnectionStatus.CONNECTED,
            phoneNumber,
            pushName,
          });

          this.emit('connected', { tenantId, phoneNumber, pushName });
        } catch {
          await this.connectionRepo.update(conn.id, {
            status: ConnectionStatus.CONNECTED,
          });
          this.emit('connected', {
            tenantId,
            phoneNumber: conn.phoneNumber,
            pushName: conn.pushName,
          });
        }
      }
    } else if (state === 'close' || state === 'disconnected') {
      inst.status = ConnectionStatus.DISCONNECTED;
      inst.qrCode = null;

      const conn = await this.connectionRepo.findOne({ where: { tenantId } });
      if (conn) {
        await this.connectionRepo.update(conn.id, {
          status: ConnectionStatus.DISCONNECTED,
        });
      }

      this.emit('disconnected', { tenantId, loggedOut: false });
    }
  }

  private async handleMessagesUpsert(tenantId: string, data: any) {
    // Evolution API sends data as array or single object
    const messages = Array.isArray(data) ? data : [data];

    for (const msg of messages) {
      const key = msg.key;
      if (!key) continue;

      // Skip outbound messages (we already saved them when sending)
      if (key.fromMe) continue;

      const remoteJid = key.remoteJid || '';
      // Skip group messages
      if (remoteJid.includes('@g.us')) continue;

      const remotePhone = remoteJid.split('@')[0];
      const pushName = msg.pushName || undefined;

      const message = msg.message || {};
      const content =
        message.conversation ||
        message.extendedTextMessage?.text ||
        message.imageMessage?.caption ||
        message.videoMessage?.caption ||
        message.documentMessage?.caption ||
        (message.imageMessage ? '[imagem]' : '') ||
        (message.videoMessage ? '[video]' : '') ||
        (message.audioMessage || message.pttMessage ? '[audio]' : '') ||
        (message.stickerMessage ? '[sticker]' : '') ||
        (message.documentMessage ? '[documento]' : '') ||
        (message.locationMessage ? '[localizacao]' : '') ||
        (message.contactMessage || message.contactsArrayMessage
          ? '[contato]'
          : '') ||
        '[midia]';

      const conn = await this.connectionRepo.findOne({ where: { tenantId } });

      try {
        const entity = this.messageRepo.create({
          tenantId,
          connectionId: conn?.id || '',
          remoteJid,
          remoteName: pushName,
          remotePhone,
          content,
          type: this.getMessageType(message),
          direction: MessageDirection.INBOUND,
          status: MessageStatus.DELIVERED,
          externalId: key.id || undefined,
        });
        const saved = await this.messageRepo.save(entity);

        this.logger.log(
          `Incoming message from ${remotePhone}: "${content.substring(0, 50)}"`,
        );
        this.emit('message', { tenantId, message: saved });
      } catch (err) {
        this.logger.error(`Failed to save incoming message: ${err.message}`);
      }
    }
  }

  private async handleMessagesUpdate(tenantId: string, data: any) {
    const updates = Array.isArray(data) ? data : [data];

    const statusMap: Record<string, MessageStatus> = {
      DELIVERY_ACK: MessageStatus.DELIVERED,
      READ: MessageStatus.READ,
      PLAYED: MessageStatus.READ,
    };

    for (const update of updates) {
      const keyId = update.key?.id;
      const newStatus = update.status;
      if (!keyId || !newStatus) continue;

      // Evolution also uses numeric codes like Baileys
      const numericMap: Record<number, MessageStatus> = {
        2: MessageStatus.SENT,
        3: MessageStatus.DELIVERED,
        4: MessageStatus.READ,
      };

      const mapped =
        statusMap[newStatus] ||
        (typeof newStatus === 'number' ? numericMap[newStatus] : undefined);

      if (mapped) {
        await this.messageRepo.update(
          { externalId: keyId, tenantId },
          { status: mapped },
        );
      }
    }
  }

  // ── Evolution API HTTP Calls ──

  private async apiCall(
    method: string,
    path: string,
    body: any,
    apiKey: string,
  ): Promise<any> {
    const url = `${this.apiUrl}${path}`;
    const headers: Record<string, string> = {
      apikey: apiKey,
      'Content-Type': 'application/json',
    };

    const options: RequestInit = { method, headers };
    if (body && method !== 'GET') {
      options.body = JSON.stringify(body);
    }

    const response = await fetch(url, options);

    if (!response.ok) {
      const text = await response.text();
      throw new Error(
        `Evolution API error ${response.status}: ${text.substring(0, 200)}`,
      );
    }

    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      return response.json();
    }
    return response.text();
  }

  private async createInstance(instanceName: string): Promise<any> {
    return this.apiCall(
      'POST',
      '/instance/create',
      {
        instanceName,
        integration: 'WHATSAPP-BAILEYS',
        qrcode: true,
        rejectCall: false,
        readMessages: false,
        alwaysOnline: false,
      },
      this.globalApiKey,
    );
  }

  private async configureWebhook(
    instanceName: string,
    instanceToken: string,
    tenantId: string,
  ) {
    if (!this.webhookUrl) {
      this.logger.warn('EVOLUTION_WEBHOOK_URL not configured, skipping webhook setup');
      return;
    }

    const webhookUrl = `${this.webhookUrl}/${tenantId}`;

    await this.apiCall(
      'POST',
      `/webhook/set/${instanceName}`,
      {
        url: webhookUrl,
        webhook_by_events: false,
        webhook_base64: false,
        enabled: true,
        events: [
          'QRCODE_UPDATED',
          'CONNECTION_UPDATE',
          'MESSAGES_UPSERT',
          'MESSAGES_UPDATE',
        ],
      },
      instanceToken,
    );

    this.logger.log(`Webhook configured for ${instanceName}: ${webhookUrl}`);
  }

  /**
   * Try to find an existing instance in Evolution API by name.
   * Returns the instance token if found, null otherwise.
   */
  private async fetchExistingInstance(
    instanceName: string,
  ): Promise<{ token: string } | null> {
    try {
      const result = await this.apiCall(
        'GET',
        `/instance/fetchInstances?instanceName=${instanceName}`,
        null,
        this.globalApiKey,
      );

      // Response can be an array or an object with instances array
      const instances = Array.isArray(result)
        ? result
        : result?.instances || [];

      const instance = instances.find(
        (i: any) =>
          i?.instance?.instanceName === instanceName ||
          i?.instanceName === instanceName,
      );

      if (!instance) return null;

      const token =
        instance?.instance?.apikey ||
        instance?.apikey ||
        instance?.token ||
        '';

      return token ? { token } : null;
    } catch (err) {
      this.logger.warn(
        `Failed to fetch existing instance ${instanceName}: ${err.message}`,
      );
      return null;
    }
  }

  private async fetchConnectionState(
    instanceName: string,
    apiKey: string,
  ): Promise<string> {
    const result = await this.apiCall(
      'GET',
      `/instance/connectionState/${instanceName}`,
      null,
      apiKey,
    );
    return result?.instance?.state || result?.state || 'close';
  }

  private async fetchQrCode(
    instanceName: string,
    apiKey: string,
  ): Promise<string | null> {
    try {
      const result = await this.apiCall(
        'GET',
        `/instance/connect/${instanceName}`,
        null,
        apiKey,
      );
      return result?.base64 || result?.qrcode?.base64 || null;
    } catch {
      return null;
    }
  }

  // ── Helpers ──

  normalizePhone(phone: string): string {
    const clean = phone.replace(/\D/g, '');
    if (clean.length === 13 && clean.startsWith('55')) return clean;
    if (clean.length === 11) return `55${clean}`;
    if (clean.length === 12 && clean.startsWith('55')) return clean;
    if (clean.length === 10) return `55${clean}`;
    return clean;
  }

  private getMessageType(msg: any): string {
    if (msg.conversation || msg.extendedTextMessage) return 'text';
    if (msg.imageMessage) return 'image';
    if (msg.videoMessage) return 'video';
    if (msg.audioMessage || msg.pttMessage) return 'audio';
    if (msg.documentMessage) return 'document';
    if (msg.stickerMessage) return 'sticker';
    if (msg.locationMessage) return 'location';
    if (msg.contactMessage || msg.contactsArrayMessage) return 'contact';
    return 'unknown';
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
