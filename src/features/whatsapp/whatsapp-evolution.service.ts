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

interface InstanceCache {
  tenantId: string;
  instanceName: string;
  instanceToken: string;
  status: ConnectionStatus;
  qrCode: string | null;
}

@Injectable()
export class WhatsappEvolutionService
  extends EventEmitter
  implements OnModuleDestroy
{
  private readonly logger = new Logger(WhatsappEvolutionService.name);
  private readonly apiUrl: string;
  private readonly globalApiKey: string;
  private readonly webhookUrl: string;

  /** In-memory cache keyed by connectionId. Supports multiple instances per tenant. */
  private instances = new Map<string, InstanceCache>();

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
        `Restoring instance ${conn.instanceName} (connectionId=${conn.id}, tenant=${conn.tenantId})`,
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

        this.instances.set(conn.id, {
          tenantId: conn.tenantId,
          instanceName: conn.instanceName,
          instanceToken: conn.instanceToken,
          status,
          qrCode: null,
        });

        if (status === ConnectionStatus.CONNECTED) {
          // Re-register webhook with connection-scoped URL (migrates old instances)
          await this.configureWebhook(
            conn.instanceName,
            conn.instanceToken,
            conn.tenantId,
            conn.id,
          ).catch((err) =>
            this.logger.warn(
              `Failed to refresh webhook for ${conn.id}: ${err.message}`,
            ),
          );
        } else {
          await this.connectionRepo.update(conn.id, { status });
        }
      } catch (err) {
        this.logger.error(`Failed to restore ${conn.id}: ${err.message}`);
        this.instances.set(conn.id, {
          tenantId: conn.tenantId,
          instanceName: conn.instanceName,
          instanceToken: conn.instanceToken,
          status: ConnectionStatus.DISCONNECTED,
          qrCode: null,
        });
      }
    }
  }

  // ── Connect / create instance ──

  /**
   * Connect (or reconnect) the given connection row to Evolution API.
   * Returns the QR code (null if already connected).
   */
  async connect(connectionId: string): Promise<string | null> {
    const conn = await this.connectionRepo.findOne({
      where: { id: connectionId },
    });
    if (!conn) throw new Error('Conexão não encontrada');

    const tenantId = conn.tenantId;
    const existing = this.instances.get(connectionId);

    // Instance name: reuse existing name or build one scoped to connectionId
    const instanceName =
      existing?.instanceName ||
      conn.instanceName ||
      `governeai_c${connectionId.replace(/-/g, '').slice(0, 20)}`;

    // Try to get instanceToken from: in-memory cache → DB → Evolution API fetch
    let instanceToken = existing?.instanceToken || conn.instanceToken || '';

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

        await this.configureWebhook(
          instanceName,
          instanceToken,
          tenantId,
          connectionId,
        );

        await this.connectionRepo.update(connectionId, {
          instanceName,
          instanceToken,
          status: ConnectionStatus.PENDING,
        });

        this.instances.set(connectionId, {
          tenantId,
          instanceName,
          instanceToken,
          status:
            state === 'open'
              ? ConnectionStatus.CONNECTED
              : ConnectionStatus.PENDING,
          qrCode: null,
        });

        if (state === 'open') return null;

        const qrCode = await this.fetchQrCode(instanceName, instanceToken);
        const inst = this.instances.get(connectionId);
        if (inst) inst.qrCode = qrCode;

        if (qrCode) {
          this.emit('qr', { tenantId, connectionId, qrCode });
        }
        return qrCode;
      } catch (err) {
        this.logger.warn(
          `Existing instance ${instanceName} unreachable: ${err.message}, will recreate`,
        );
      }
    }

    // Create new instance in Evolution API
    const result = await this.createInstance(instanceName);
    this.logger.log(
      `Instance created: ${JSON.stringify({ hash: result.hash, instance: result.instance, token: result.token })}`,
    );
    const newToken =
      (typeof result.hash === 'string' ? result.hash : result.hash?.apikey) ||
      result.token ||
      result.instance?.token ||
      '';

    await this.configureWebhook(instanceName, newToken, tenantId, connectionId);

    await this.connectionRepo.update(connectionId, {
      instanceName,
      instanceToken: newToken,
      status: ConnectionStatus.PENDING,
    });

    this.instances.set(connectionId, {
      tenantId,
      instanceName,
      instanceToken: newToken,
      status: ConnectionStatus.PENDING,
      qrCode: null,
    });

    const qrCode = await this.fetchQrCode(instanceName, newToken);
    const inst = this.instances.get(connectionId);
    if (inst) inst.qrCode = qrCode;

    if (qrCode) {
      this.emit('qr', { tenantId, connectionId, qrCode });
    }

    return qrCode;
  }

  // ── Send message ──

  async sendMessage(
    connectionId: string,
    phone: string,
    content: string,
    quotedId?: string,
  ) {
    const inst = await this.ensureInstance(connectionId);
    if (!inst) {
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

    this.logger.log(
      `[SEND_TEXT] response keys=${response ? Object.keys(response).join(',') : 'null'} key.id=${response?.key?.id}`,
    );

    const existingMsg = await this.messageRepo.findOne({
      where: {
        tenantId: inst.tenantId,
        connectionId,
        remotePhone: normalizedPhone,
      },
      select: ['remoteName'],
      order: { createdAt: 'DESC' },
    });

    const entity = this.messageRepo.create({
      tenantId: inst.tenantId,
      connectionId,
      remoteJid: `${normalizedPhone}@s.whatsapp.net`,
      remotePhone: normalizedPhone,
      remoteName: existingMsg?.remoteName || undefined,
      content,
      type: 'text',
      direction: MessageDirection.OUTBOUND,
      status: MessageStatus.SENT,
      externalId: response?.key?.id || undefined,
    });

    const saved = await this.messageRepo.save(entity);
    this.emit('message', { tenantId: inst.tenantId, connectionId, message: saved });
    return saved;
  }

  // ── Broadcast ──

  async broadcast(connectionId: string, phones: string[], content: string) {
    const results: { phone: string; success: boolean; error?: string }[] = [];

    for (const phone of phones) {
      try {
        await this.sendMessage(connectionId, phone, content);
        results.push({ phone, success: true });
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

  async disconnect(connectionId: string) {
    const inst = this.instances.get(connectionId);

    // Fall back to DB if not in cache
    let instanceName = inst?.instanceName;
    let instanceToken = inst?.instanceToken;
    let tenantId = inst?.tenantId;

    if (!instanceName) {
      const conn = await this.connectionRepo.findOne({
        where: { id: connectionId },
      });
      if (!conn) return;
      instanceName = conn.instanceName || undefined;
      instanceToken = conn.instanceToken || undefined;
      tenantId = conn.tenantId;
    }

    if (instanceName && instanceToken) {
      try {
        await this.apiCall(
          'DELETE',
          `/instance/logout/${instanceName}`,
          null,
          instanceToken,
        );
      } catch (err) {
        this.logger.warn(
          `Logout failed for ${connectionId}: ${err.message}`,
        );
      }

      try {
        await this.apiCall(
          'DELETE',
          `/instance/delete/${instanceName}`,
          null,
          this.globalApiKey,
        );
      } catch (err) {
        this.logger.warn(
          `Delete instance failed for ${connectionId}: ${err.message}`,
        );
      }
    }

    this.instances.delete(connectionId);

    await this.connectionRepo.update(connectionId, {
      status: ConnectionStatus.DISCONNECTED,
      instanceName: undefined,
      instanceToken: undefined,
    });

    if (tenantId) {
      this.emit('disconnected', { tenantId, connectionId, loggedOut: true });
    }
  }

  // ── Status ──

  async getStatus(connectionId: string): Promise<{
    status: ConnectionStatus | 'DISCONNECTED';
    qrCode: string | null;
  }> {
    const inst = this.instances.get(connectionId);
    if (inst) return { status: inst.status, qrCode: inst.qrCode };

    // Cache miss — check DB + Evolution API to rebuild cache
    const conn = await this.connectionRepo.findOne({
      where: { id: connectionId },
    });
    if (!conn?.instanceName || !conn?.instanceToken) {
      return { status: 'DISCONNECTED', qrCode: null };
    }

    try {
      const state = await this.fetchConnectionState(
        conn.instanceName,
        conn.instanceToken,
      );
      const status =
        state === 'open'
          ? ConnectionStatus.CONNECTED
          : state === 'connecting'
            ? ConnectionStatus.PENDING
            : ConnectionStatus.DISCONNECTED;

      this.instances.set(connectionId, {
        tenantId: conn.tenantId,
        instanceName: conn.instanceName,
        instanceToken: conn.instanceToken,
        status,
        qrCode: null,
      });

      if (conn.status !== status) {
        await this.connectionRepo.update(conn.id, { status });
      }

      return { status, qrCode: null };
    } catch (err) {
      this.logger.warn(
        `getStatus: failed to fetch state for connection ${connectionId}: ${err.message}`,
      );
      return { status: 'DISCONNECTED', qrCode: null };
    }
  }

  async isConnected(connectionId: string): Promise<boolean> {
    const { status } = await this.getStatus(connectionId);
    return status === ConnectionStatus.CONNECTED;
  }

  // ── Webhook Handlers ──

  /**
   * Route an inbound Evolution webhook to the correct connection.
   * If `connectionId` is null (legacy route), resolve it via the tenant's default connection.
   */
  async handleWebhook(
    tenantId: string,
    connectionId: string | null,
    event: string,
    data: any,
  ) {
    let resolvedConnectionId = connectionId;

    if (!resolvedConnectionId) {
      // Legacy webhook: find the default (or first) connection for this tenant
      const conn =
        (await this.connectionRepo.findOne({
          where: { tenantId, isDefault: true },
        })) ||
        (await this.connectionRepo.findOne({
          where: { tenantId },
          order: { createdAt: 'ASC' },
        }));

      if (!conn) {
        this.logger.warn(
          `Legacy webhook for tenant ${tenantId} but no connection found`,
        );
        return;
      }
      resolvedConnectionId = conn.id;
    }

    this.logger.log(
      `Webhook [${event}] tenant=${tenantId} connection=${resolvedConnectionId}`,
    );

    switch (event) {
      case 'QRCODE_UPDATED':
        await this.handleQrCodeUpdate(tenantId, resolvedConnectionId, data);
        break;
      case 'CONNECTION_UPDATE':
        await this.handleConnectionUpdate(tenantId, resolvedConnectionId, data);
        break;
      case 'MESSAGES_UPSERT':
        await this.handleMessagesUpsert(tenantId, resolvedConnectionId, data);
        break;
      case 'MESSAGES_UPDATE':
        await this.handleMessagesUpdate(tenantId, resolvedConnectionId, data);
        break;
    }
  }

  private async handleQrCodeUpdate(
    tenantId: string,
    connectionId: string,
    data: any,
  ) {
    const qrCode = data?.qrcode?.base64 || data?.qrcode;
    const inst = this.instances.get(connectionId);
    if (inst && qrCode) {
      inst.qrCode = qrCode;
      inst.status = ConnectionStatus.PENDING;
      this.emit('qr', { tenantId, connectionId, qrCode });
    }
  }

  private async handleConnectionUpdate(
    tenantId: string,
    connectionId: string,
    data: any,
  ) {
    const state = data?.state || data?.status || data?.instance?.state;
    this.logger.log(
      `[CONNECTION_UPDATE] state="${state}" connection=${connectionId}`,
    );
    const inst = this.instances.get(connectionId);
    if (!inst) return;

    if (state === 'open') {
      inst.status = ConnectionStatus.CONNECTED;
      inst.qrCode = null;

      const conn = await this.connectionRepo.findOne({
        where: { id: connectionId },
      });
      if (conn) {
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

          this.emit('connected', {
            tenantId,
            connectionId,
            phoneNumber,
            pushName,
          });
        } catch {
          await this.connectionRepo.update(conn.id, {
            status: ConnectionStatus.CONNECTED,
          });
          this.emit('connected', {
            tenantId,
            connectionId,
            phoneNumber: conn.phoneNumber,
            pushName: conn.pushName,
          });
        }
      }
    } else if (state === 'close' || state === 'disconnected') {
      inst.status = ConnectionStatus.DISCONNECTED;
      inst.qrCode = null;

      await this.connectionRepo.update(connectionId, {
        status: ConnectionStatus.DISCONNECTED,
      });

      this.emit('disconnected', { tenantId, connectionId, loggedOut: false });
    }
  }

  private async handleMessagesUpsert(
    tenantId: string,
    connectionId: string,
    data: any,
  ) {
    this.logger.log(
      `[MESSAGES_UPSERT] connection=${connectionId} type=${typeof data}, isArray=${Array.isArray(data)}`,
    );

    let messages: any[];
    if (Array.isArray(data)) {
      messages = data;
    } else if (data?.messages && Array.isArray(data.messages)) {
      messages = data.messages;
    } else if (data?.message && data.message.key) {
      messages = [data.message];
    } else if (data?.key) {
      messages = [data];
    } else {
      messages = [data];
    }

    for (const msg of messages) {
      const key = msg.key;
      if (!key) {
        this.logger.warn(`[MESSAGES_UPSERT] message without key, skipping`);
        continue;
      }

      const isFromMe = !!key.fromMe;
      const remoteJid = key.remoteJid || '';

      if (remoteJid.includes('@g.us')) continue;

      const externalId = key.id || undefined;
      if (isFromMe && externalId) {
        const exists = await this.messageRepo.findOne({
          where: { tenantId, connectionId, externalId },
          select: ['id'],
        });
        if (exists) continue;
      }

      const rawPhone = remoteJid.split('@')[0];
      const remotePhone = this.normalizePhone(rawPhone);
      const pushName = msg.pushName || undefined;

      const message = msg.message || {};
      const msgType = this.getMessageType(message);

      if (msgType === 'reaction') {
        await this.handleReaction(
          tenantId,
          connectionId,
          message.reactionMessage,
          remotePhone,
        );
        continue;
      }

      if (msgType === 'protocol' || msgType === 'edited') continue;

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

      const hasMedia =
        this.extractMediaBase64(message, msgType) !== null ||
        ['image', 'video', 'audio', 'sticker', 'document'].includes(msgType);
      const mediaUrl = hasMedia ? 'proxy' : undefined;

      const direction = isFromMe
        ? MessageDirection.OUTBOUND
        : MessageDirection.INBOUND;

      try {
        const normalizedJid = `${remotePhone}@s.whatsapp.net`;
        const entity = this.messageRepo.create({
          tenantId,
          connectionId,
          remoteJid: normalizedJid,
          remoteName: isFromMe ? undefined : pushName,
          remotePhone,
          content,
          type: msgType,
          direction,
          status: isFromMe ? MessageStatus.SENT : MessageStatus.DELIVERED,
          externalId,
          mediaUrl,
          readByUser: isFromMe ? true : false,
        });
        const saved = await this.messageRepo.save(entity);

        this.logger.log(
          `${isFromMe ? 'Outbound (phone)' : 'Incoming'} ${remotePhone}: type=${msgType} connection=${connectionId}`,
        );
        this.emit('message', { tenantId, connectionId, message: saved });
      } catch (err) {
        this.logger.error(`Failed to save incoming message: ${err.message}`);
      }
    }
  }

  private async handleMessagesUpdate(
    tenantId: string,
    connectionId: string,
    data: any,
  ) {
    const updates = Array.isArray(data) ? data : [data];

    const statusMap: Record<string, MessageStatus> = {
      SERVER_ACK: MessageStatus.SENT,
      DELIVERY_ACK: MessageStatus.DELIVERED,
      READ: MessageStatus.READ,
      PLAYED: MessageStatus.READ,
      SENT: MessageStatus.SENT,
    };

    const numericMap: Record<number, MessageStatus> = {
      0: MessageStatus.PENDING,
      1: MessageStatus.SENT,
      2: MessageStatus.DELIVERED,
      3: MessageStatus.DELIVERED,
      4: MessageStatus.READ,
      5: MessageStatus.READ,
    };

    for (const update of updates) {
      const keyId = update.keyId || update.key?.id;
      if (!keyId) continue;

      const rawStatus =
        update.status ??
        update.update?.status ??
        update.update?.messageStatus ??
        undefined;

      if (rawStatus === undefined || rawStatus === null) continue;

      const mapped =
        (typeof rawStatus === 'string' ? statusMap[rawStatus] : undefined) ||
        (typeof rawStatus === 'number' ? numericMap[rawStatus] : undefined);

      this.logger.log(
        `[MESSAGES_UPDATE] keyId=${keyId} connection=${connectionId} raw=${rawStatus} mapped=${mapped || 'UNMAPPED'}`,
      );

      if (mapped) {
        const result = await this.messageRepo.update(
          { externalId: keyId, tenantId, connectionId },
          { status: mapped },
        );

        if (result.affected && result.affected > 0) {
          this.emit('message:status', {
            tenantId,
            connectionId,
            externalId: keyId,
            status: mapped,
          });
        }
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
    connectionId: string,
  ) {
    if (!this.webhookUrl) {
      this.logger.warn(
        'EVOLUTION_WEBHOOK_URL not configured, skipping webhook setup',
      );
      return;
    }

    const webhookUrl = `${this.webhookUrl}/${tenantId}/${connectionId}`;

    await this.apiCall(
      'POST',
      `/webhook/set/${instanceName}`,
      {
        webhook: {
          url: webhookUrl,
          webhook_by_events: false,
          webhook_base64: true,
          enabled: true,
          events: [
            'QRCODE_UPDATED',
            'CONNECTION_UPDATE',
            'MESSAGES_UPSERT',
            'MESSAGES_UPDATE',
          ],
        },
      },
      instanceToken,
    );

    this.logger.log(`Webhook configured for ${instanceName}: ${webhookUrl}`);
  }

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

      const instances = Array.isArray(result)
        ? result
        : result?.instances || [];

      const instance = instances.find(
        (i: any) =>
          i?.name === instanceName ||
          i?.instance?.instanceName === instanceName ||
          i?.instanceName === instanceName,
      );

      if (!instance) return null;

      const token =
        instance?.token || instance?.instance?.apikey || instance?.apikey || '';

      return token ? { token } : null;
    } catch (err) {
      this.logger.warn(
        `Failed to fetch existing instance ${instanceName}: ${err.message}`,
      );
      return null;
    }
  }

  /**
   * Ensure instance is in the in-memory map. If not, lazy-restore from DB.
   */
  private async ensureInstance(
    connectionId: string,
  ): Promise<InstanceCache | null> {
    let inst = this.instances.get(connectionId);
    if (inst && inst.status === ConnectionStatus.CONNECTED) return inst;

    const { status } = await this.getStatus(connectionId);
    if (status === ConnectionStatus.CONNECTED) {
      inst = this.instances.get(connectionId);
      if (inst) return inst;
    }

    return null;
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

  /**
   * Normalize any phone to 55 + DDD(2) + 9 + number(8) = 13 digits for mobile.
   */
  normalizePhone(phone: string): string {
    const clean = phone.replace(/\D/g, '');

    if (clean.length === 13 && clean.startsWith('55')) return clean;

    if (clean.length === 12 && clean.startsWith('55')) {
      const ddd = clean.slice(2, 4);
      const number = clean.slice(4);
      if (number[0] >= '6') {
        return `55${ddd}9${number}`;
      }
      return clean;
    }

    if (clean.length === 11) return `55${clean}`;

    if (clean.length === 10) {
      const ddd = clean.slice(0, 2);
      const number = clean.slice(2);
      if (number[0] >= '6') {
        return `55${ddd}9${number}`;
      }
      return `55${clean}`;
    }

    return clean;
  }

  // ── Send media message ──

  async sendMedia(
    connectionId: string,
    phone: string,
    mediaBuffer: Buffer,
    mimetype: string,
    filename: string,
    caption?: string,
  ) {
    const inst = await this.ensureInstance(connectionId);
    if (!inst) {
      throw new Error('WhatsApp não conectado');
    }

    const normalizedPhone = this.normalizePhone(phone);

    const isImage = mimetype.startsWith('image/');
    const isVideo = mimetype.startsWith('video/');
    const isAudio = mimetype.startsWith('audio/');
    let mediatype = 'Document';
    let internalType = 'document';
    if (isImage) {
      mediatype = 'Image';
      internalType = 'image';
    } else if (isVideo) {
      mediatype = 'Video';
      internalType = 'video';
    } else if (isAudio) {
      mediatype = 'Audio';
      internalType = 'audio';
    }

    const base64 = mediaBuffer.toString('base64');

    const body: any = {
      number: normalizedPhone,
      mediatype,
      mimetype,
      media: `data:${mimetype};base64,${base64}`,
      fileName: filename,
    };
    if (caption) body.caption = caption;

    const response = await this.apiCall(
      'POST',
      `/message/sendMedia/${inst.instanceName}`,
      body,
      inst.instanceToken,
    );

    const existingMsg = await this.messageRepo.findOne({
      where: {
        tenantId: inst.tenantId,
        connectionId,
        remotePhone: normalizedPhone,
      },
      select: ['remoteName'],
      order: { createdAt: 'DESC' },
    });

    const entity = this.messageRepo.create({
      tenantId: inst.tenantId,
      connectionId,
      remoteJid: `${normalizedPhone}@s.whatsapp.net`,
      remotePhone: normalizedPhone,
      remoteName: existingMsg?.remoteName || undefined,
      content:
        caption || `[${internalType === 'image' ? 'imagem' : internalType}]`,
      type: internalType,
      direction: MessageDirection.OUTBOUND,
      status: MessageStatus.SENT,
      externalId: response?.key?.id || undefined,
      mediaUrl: 'proxy',
    });

    const saved = await this.messageRepo.save(entity);
    this.emit('message', { tenantId: inst.tenantId, connectionId, message: saved });
    return saved;
  }

  // ── Fetch media from Evolution API (proxy) ──

  async getMediaBase64(
    connectionId: string,
    messageExternalId: string,
    remoteJid: string,
  ): Promise<{ base64: string; mimetype: string } | null> {
    const inst = await this.ensureInstance(connectionId);
    if (!inst) return null;

    try {
      const result = await this.apiCall(
        'POST',
        `/chat/getBase64FromMediaMessage/${inst.instanceName}`,
        {
          message: {
            key: {
              remoteJid,
              id: messageExternalId,
            },
          },
        },
        inst.instanceToken,
      );

      if (result?.base64 && result?.mimetype) {
        return { base64: result.base64, mimetype: result.mimetype };
      }
      return null;
    } catch (err) {
      this.logger.warn(
        `Failed to fetch media from Evolution API: ${err.message}`,
      );
      return null;
    }
  }

  // ── Handle reactions ──

  private async handleReaction(
    tenantId: string,
    connectionId: string,
    reactionMsg: any,
    senderPhone: string,
  ) {
    if (!reactionMsg?.key?.id) return;

    const originalExternalId = reactionMsg.key.id;
    const emoji = reactionMsg.text || '';

    const original = await this.messageRepo.findOne({
      where: { tenantId, connectionId, externalId: originalExternalId },
    });

    if (!original) {
      this.logger.warn(
        `Reaction target not found: externalId=${originalExternalId} connection=${connectionId}`,
      );
      return;
    }

    const reactions = original.reactions || [];

    if (emoji) {
      const idx = reactions.findIndex((r) => r.from === senderPhone);
      if (idx >= 0) {
        reactions[idx].emoji = emoji;
      } else {
        reactions.push({ emoji, from: senderPhone });
      }
    } else {
      const idx = reactions.findIndex((r) => r.from === senderPhone);
      if (idx >= 0) reactions.splice(idx, 1);
    }

    await this.messageRepo.update(original.id, { reactions });

    this.logger.log(
      `Reaction ${emoji || '(removed)'} on message ${original.id} from ${senderPhone}`,
    );

    this.emit('message', {
      tenantId,
      connectionId,
      message: { ...original, reactions },
    });
  }

  // ── Extract and save media from incoming webhook ──

  private extractMediaBase64(
    message: any,
    msgType: string,
  ): { base64: string; mimetype: string } | null {
    const mediaTypes = ['image', 'video', 'audio', 'sticker', 'document'];
    if (!mediaTypes.includes(msgType)) return null;

    const mediaMsg =
      message.imageMessage ||
      message.videoMessage ||
      message.audioMessage ||
      message.pttMessage ||
      message.stickerMessage ||
      message.documentMessage;

    if (!mediaMsg) return null;

    const base64 = mediaMsg.base64;
    if (!base64) return null;

    return {
      base64,
      mimetype: mediaMsg.mimetype || 'application/octet-stream',
    };
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
    if (msg.reactionMessage) return 'reaction';
    if (msg.protocolMessage) return 'protocol';
    if (msg.editedMessage) return 'edited';
    return 'unknown';
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
