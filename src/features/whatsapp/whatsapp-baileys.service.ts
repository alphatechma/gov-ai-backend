import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  WASocket,
} from 'baileys';
import * as QRCode from 'qrcode';
import * as path from 'path';
import * as fs from 'fs';
import { WhatsappConnection, ConnectionStatus } from './entities/whatsapp-connection.entity';
import {
  WhatsappMessage,
  MessageDirection,
  MessageStatus,
} from './entities/whatsapp-message.entity';
import { EventEmitter } from 'events';

interface TenantSocket {
  socket: WASocket;
  connectionId: string;
  qrCode: string | null;
  status: ConnectionStatus;
  retryCount: number;
  lidToPhone: Map<string, string>; // LID JID → phone JID mapping
}

@Injectable()
export class WhatsappBaileysService extends EventEmitter implements OnModuleDestroy {
  private readonly logger = new Logger(WhatsappBaileysService.name);
  private sockets = new Map<string, TenantSocket>();
  private readonly sessionsDir: string;

  constructor(
    @InjectRepository(WhatsappConnection)
    private connectionRepo: Repository<WhatsappConnection>,
    @InjectRepository(WhatsappMessage)
    private messageRepo: Repository<WhatsappMessage>,
  ) {
    super();
    this.sessionsDir = path.resolve(process.env.WHATSAPP_SESSIONS_PATH || './whatsapp-sessions');
    if (!fs.existsSync(this.sessionsDir)) {
      fs.mkdirSync(this.sessionsDir, { recursive: true });
    }
  }

  async onModuleDestroy() {
    for (const [tenantId, ts] of this.sockets) {
      this.logger.log(`Closing WhatsApp socket for tenant ${tenantId}`);
      ts.socket.end(undefined);
    }
    this.sockets.clear();
  }

  // ── Restore active connections on startup ──

  async restoreConnections() {
    const active = await this.connectionRepo.find({
      where: { status: ConnectionStatus.CONNECTED },
    });
    for (const conn of active) {
      this.logger.log(`Restoring WhatsApp session for tenant ${conn.tenantId}`);
      try {
        await this.connect(conn.tenantId, conn.id);
      } catch (err) {
        this.logger.error(`Failed to restore ${conn.tenantId}: ${err.message}`);
      }
    }
  }

  // ── Connect / create socket ──

  async connect(tenantId: string, connectionId: string): Promise<string | null> {
    if (this.sockets.has(tenantId)) {
      const existing = this.sockets.get(tenantId)!;
      if (existing.status === ConnectionStatus.CONNECTED) return null;
      // Close stale socket
      existing.socket.end(undefined);
      this.sockets.delete(tenantId);
    }

    const sessionPath = path.join(this.sessionsDir, tenantId);
    const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
    const { version } = await fetchLatestBaileysVersion();

    const socket = makeWASocket({
      version,
      auth: state,
      printQRInTerminal: false,
      browser: ['GoverneAI', 'Chrome', '22.0'],
      generateHighQualityLinkPreview: false,
      syncFullHistory: false,
      defaultQueryTimeoutMs: undefined,
      connectTimeoutMs: 60000,
      qrTimeout: 60000,
      keepAliveIntervalMs: 15000,
    });

    const tenantSocket: TenantSocket = {
      socket,
      connectionId,
      qrCode: null,
      status: ConnectionStatus.PENDING,
      retryCount: 0,
      lidToPhone: new Map(),
    };
    this.sockets.set(tenantId, tenantSocket);

    // ── QR Code ──
    socket.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        tenantSocket.qrCode = await QRCode.toDataURL(qr);
        tenantSocket.status = ConnectionStatus.PENDING;
        tenantSocket.retryCount = 0;
        this.emit('qr', { tenantId, qrCode: tenantSocket.qrCode });
        this.logger.log(`QR code generated for tenant ${tenantId}`);
      }

      if (connection === 'open') {
        tenantSocket.qrCode = null;
        tenantSocket.status = ConnectionStatus.CONNECTED;
        tenantSocket.retryCount = 0;

        const phoneNumber = socket.user?.id?.split(':')[0] || undefined;
        const pushName = socket.user?.name || undefined;

        await this.connectionRepo.update(connectionId, {
          status: ConnectionStatus.CONNECTED,
          phoneNumber,
          pushName,
        });

        this.emit('connected', { tenantId, phoneNumber, pushName });
        this.logger.log(`WhatsApp connected for tenant ${tenantId} (${phoneNumber})`);
      }

      if (connection === 'close') {
        const statusCode = (lastDisconnect?.error as any)?.output?.statusCode;
        const isLoggedOut = statusCode === DisconnectReason.loggedOut;
        const isRestartRequired = statusCode === DisconnectReason.restartRequired;

        tenantSocket.status = ConnectionStatus.DISCONNECTED;
        tenantSocket.retryCount++;

        // Only reconnect if: explicitly restart required, OR was previously connected and code is known
        const wasConnected = tenantSocket.retryCount <= 1 && statusCode !== undefined;
        const shouldReconnect = (isRestartRequired || wasConnected) && !isLoggedOut && tenantSocket.retryCount <= 5;

        if (shouldReconnect) {
          this.logger.warn(`Reconnecting WhatsApp for tenant ${tenantId} (code: ${statusCode}, attempt: ${tenantSocket.retryCount})`);
          this.sockets.delete(tenantId);
          setTimeout(() => this.connect(tenantId, connectionId), 5000);
        } else {
          this.logger.warn(`WhatsApp disconnected for tenant ${tenantId} (code: ${statusCode}, loggedOut: ${isLoggedOut})`);
          await this.connectionRepo.update(connectionId, {
            status: ConnectionStatus.DISCONNECTED,
          });
          if (isLoggedOut && fs.existsSync(sessionPath)) {
            fs.rmSync(sessionPath, { recursive: true, force: true });
          }
          this.sockets.delete(tenantId);
          this.emit('disconnected', { tenantId, loggedOut: isLoggedOut });
        }
      }
    });

    // ── Save credentials ──
    socket.ev.on('creds.update', saveCreds);

    // ── Build LID → Phone mapping from contacts ──
    socket.ev.on('contacts.upsert', (contacts) => {
      for (const contact of contacts) {
        const id = contact.id; // e.g. "5598999657740@s.whatsapp.net"
        const lid = (contact as any).lid; // e.g. "124343950544964@lid"
        if (lid && id) {
          tenantSocket.lidToPhone.set(lid, id);
          this.logger.log(`[LID MAP] ${lid} → ${id} (${(contact as any).name || (contact as any).notify || 'unknown'})`);
        }
      }
      this.logger.log(`[LID MAP] Total mappings: ${tenantSocket.lidToPhone.size}`);
    });

    socket.ev.on('contacts.update', (updates) => {
      for (const update of updates) {
        const id = update.id;
        const lid = (update as any).lid;
        if (lid && id && id.endsWith('@s.whatsapp.net')) {
          tenantSocket.lidToPhone.set(lid, id);
        } else if (lid && id && id.endsWith('@lid')) {
          // id is the LID, check if there's a phone reference
        }
      }
    });

    // ── Incoming messages ──
    socket.ev.on('messages.upsert', async ({ messages, type }) => {
      this.logger.warn(`[UPSERT] type=${type}, count=${messages.length}`);

      if (type !== 'notify') {
        this.logger.warn(`[UPSERT] Skipping: type is "${type}", not "notify"`);
        return;
      }

      for (const msg of messages) {
        const msgKeys = msg.message ? Object.keys(msg.message) : ['NO_MESSAGE'];
        this.logger.warn(`[UPSERT] Message: fromMe=${msg.key.fromMe}, jid=${msg.key.remoteJid}, keys=[${msgKeys.join(', ')}]`);

        if (!msg.message) {
          this.logger.warn(`[UPSERT] Skipping: no msg.message`);
          continue;
        }
        if (msg.key.fromMe) {
          this.logger.warn(`[UPSERT] Skipping: fromMe=true`);
          continue;
        }

        const remoteJid = msg.key.remoteJid || '';
        const isPersonalChat = remoteJid.endsWith('@s.whatsapp.net') || remoteJid.endsWith('@lid');
        if (!isPersonalChat) {
          this.logger.warn(`[UPSERT] Skipping: JID "${remoteJid}" is not a personal chat`);
          continue;
        }

        // For @lid JIDs, try to resolve to the real phone JID
        let resolvedJid = remoteJid;
        if (remoteJid.endsWith('@lid')) {
          const phoneJid = tenantSocket.lidToPhone.get(remoteJid);
          if (phoneJid) {
            resolvedJid = phoneJid;
            this.logger.warn(`[UPSERT] Resolved LID ${remoteJid} → ${resolvedJid} (from map)`);
          } else {
            // LID not in map yet — keep as LID, will still be saved and displayed
            this.logger.warn(`[UPSERT] LID ${remoteJid} not resolved yet (map size: ${tenantSocket.lidToPhone.size}), saving with LID`);
          }
        }

        const remotePhone = resolvedJid.split('@')[0];

        // Unwrap nested message containers (ephemeral, viewOnce, edited, etc.)
        const innerMessage = this.extractInnerMessage(msg.message);

        const content =
          innerMessage.conversation ||
          innerMessage.extendedTextMessage?.text ||
          innerMessage.imageMessage?.caption ||
          innerMessage.videoMessage?.caption ||
          innerMessage.documentMessage?.caption ||
          (innerMessage.imageMessage ? '[imagem]' : '') ||
          (innerMessage.videoMessage ? '[video]' : '') ||
          (innerMessage.audioMessage || innerMessage.pttMessage ? '[audio]' : '') ||
          (innerMessage.stickerMessage ? '[sticker]' : '') ||
          (innerMessage.documentMessage ? '[documento]' : '') ||
          (innerMessage.locationMessage ? '[localizacao]' : '') ||
          (innerMessage.contactMessage || innerMessage.contactsArrayMessage ? '[contato]' : '') ||
          '[midia]';
        const remoteName = msg.pushName || undefined;

        this.logger.log(`Incoming message from ${remotePhone} (${remoteName || 'unknown'}): type=${this.getMessageType(innerMessage)}, content="${content.substring(0, 50)}"`);

        try {
          const entity = this.messageRepo.create({
            tenantId,
            connectionId,
            remoteJid: resolvedJid,
            remoteName,
            remotePhone,
            content,
            type: this.getMessageType(innerMessage),
            direction: MessageDirection.INBOUND,
            status: MessageStatus.DELIVERED,
            externalId: msg.key.id || undefined,
          });
          const saved = await this.messageRepo.save(entity);

          this.logger.log(`Incoming message saved with id=${saved.id}`);
          this.emit('message', { tenantId, message: saved });
        } catch (err) {
          this.logger.error(`Failed to save incoming message: ${err.message}`);
        }
      }
    });

    // ── Message status updates ──
    socket.ev.on('messages.update', async (updates) => {
      for (const update of updates) {
        if (!update.key?.id) continue;
        const newStatus = update.update?.status;
        if (!newStatus) continue;

        const statusMap: Record<number, MessageStatus> = {
          2: MessageStatus.SENT,
          3: MessageStatus.DELIVERED,
          4: MessageStatus.READ,
        };

        const mapped = statusMap[newStatus];
        if (mapped) {
          await this.messageRepo.update(
            { externalId: update.key.id, tenantId },
            { status: mapped },
          );
        }
      }
    });

    return tenantSocket.qrCode;
  }

  // ── Send message ──

  async sendMessage(tenantId: string, phone: string, content: string, quotedId?: string) {
    const ts = this.sockets.get(tenantId);
    if (!ts || ts.status !== ConnectionStatus.CONNECTED) {
      throw new Error('WhatsApp nao conectado');
    }

    const clean = phone.replace(/\D/g, '');
    const isLid = clean.length > 13;
    let jid: string;

    if (isLid) {
      // LID contact — send directly using LID JID
      jid = `${clean}@lid`;
      this.logger.log(`Sending to LID contact: ${jid}`);
    } else {
      const normalizedPhone = this.normalizePhone(phone);
      jid = `${normalizedPhone}@s.whatsapp.net`;

      // Verify the number exists on WhatsApp and get correct JID
      // (handles Brazil 9th digit issue - some numbers are 12 or 13 digits)
      try {
        const results = await ts.socket.onWhatsApp(jid);
        const result = results?.[0];
        if (result?.exists && result.jid) {
          this.logger.log(`onWhatsApp verified: ${jid} → ${result.jid}`);
          jid = result.jid;
        } else {
          this.logger.warn(`Number ${jid} not found on WhatsApp`);
          throw new Error(`Numero ${phone} nao encontrado no WhatsApp`);
        }
      } catch (err) {
        if (err.message?.includes('nao encontrado')) throw err;
        this.logger.warn(`onWhatsApp check failed for ${jid}: ${err.message}, proceeding anyway`);
      }
    }

    const remotePhone = jid.split('@')[0];

    this.logger.log(`Sending message to ${jid} (input: ${phone})`);

    const quoted = quotedId
      ? { key: { remoteJid: jid, id: quotedId, fromMe: false } }
      : undefined;

    try {
      const sent = await ts.socket.sendMessage(jid, { text: content }, { quoted } as any);

      this.logger.log(`Message sent to ${jid}, externalId: ${sent?.key?.id}`);

      const entity = this.messageRepo.create({
        tenantId,
        connectionId: ts.connectionId,
        remoteJid: jid,
        remotePhone,
        content,
        type: 'text',
        direction: MessageDirection.OUTBOUND,
        status: MessageStatus.SENT,
        externalId: sent?.key?.id || undefined,
      });
      const saved = await this.messageRepo.save(entity);

      return saved;
    } catch (err) {
      this.logger.error(`Failed to send message to ${jid}: ${err.message}`);
      throw err;
    }
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
    const ts = this.sockets.get(tenantId);
    if (!ts) return;

    await ts.socket.logout();
    ts.socket.end(undefined);
    this.sockets.delete(tenantId);

    // Clean session
    const sessionPath = path.join(this.sessionsDir, tenantId);
    if (fs.existsSync(sessionPath)) {
      fs.rmSync(sessionPath, { recursive: true, force: true });
    }

    await this.connectionRepo.update(ts.connectionId, {
      status: ConnectionStatus.DISCONNECTED,
    });

    this.emit('disconnected', { tenantId, loggedOut: true });
  }

  // ── Status ──

  getStatus(tenantId: string) {
    const ts = this.sockets.get(tenantId);
    if (!ts) return { status: 'DISCONNECTED' as const, qrCode: null };
    return { status: ts.status, qrCode: ts.qrCode };
  }

  getQrCode(tenantId: string): string | null {
    return this.sockets.get(tenantId)?.qrCode || null;
  }

  isConnected(tenantId: string): boolean {
    return this.sockets.get(tenantId)?.status === ConnectionStatus.CONNECTED;
  }

  // ── Helpers ──

  /** Normalize any phone input to full international digits (e.g. 5511999998888) */
  normalizePhone(phone: string): string {
    const clean = phone.replace(/\D/g, '');
    // Already has country code 55 + area code + number (13 digits)
    if (clean.length === 13 && clean.startsWith('55')) return clean;
    // Local with area code (11 digits): add 55
    if (clean.length === 11) return `55${clean}`;
    // 12 digits starting with 55 (old format without 9th digit)
    if (clean.length === 12 && clean.startsWith('55')) return clean;
    // 10 digits (landline or old mobile without 9): add 55
    if (clean.length === 10) return `55${clean}`;
    // Already international or unknown format — return as-is
    return clean;
  }

  private phoneToJid(phone: string): string {
    return `${this.normalizePhone(phone)}@s.whatsapp.net`;
  }

  /** Unwrap nested message containers (ephemeral, viewOnce, edited, etc.) */
  private extractInnerMessage(message: any): any {
    if (!message) return {};
    // Ephemeral (disappearing messages)
    if (message.ephemeralMessage?.message) {
      return this.extractInnerMessage(message.ephemeralMessage.message);
    }
    // View once
    if (message.viewOnceMessage?.message) {
      return this.extractInnerMessage(message.viewOnceMessage.message);
    }
    if (message.viewOnceMessageV2?.message) {
      return this.extractInnerMessage(message.viewOnceMessageV2.message);
    }
    // Edited message
    if (message.editedMessage?.message) {
      return this.extractInnerMessage(message.editedMessage.message);
    }
    // Document with caption
    if (message.documentWithCaptionMessage?.message) {
      return this.extractInnerMessage(message.documentWithCaptionMessage.message);
    }
    return message;
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
