import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import makeWASocket, {
  useMultiFileAuthState,
  makeCacheableSignalKeyStore,
  DisconnectReason,
  fetchLatestBaileysVersion,
  WASocket,
} from 'baileys';
import { Boom } from '@hapi/boom';
import pino from 'pino';
import * as QRCode from 'qrcode';
import * as path from 'path';
import * as fs from 'fs';
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

interface TenantSocket {
  socket: WASocket;
  connectionId: string;
  qrCode: string | null;
  status: ConnectionStatus;
  retryCount: number;
  reconnecting: boolean;
  lidToPhone: Map<string, string>;
}

const baileysLogger = pino({ level: 'silent' });

@Injectable()
export class WhatsappBaileysService
  extends EventEmitter
  implements OnModuleDestroy
{
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
    this.sessionsDir = path.resolve(
      process.env.WHATSAPP_SESSIONS_PATH || './whatsapp-sessions',
    );
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

  async connect(
    tenantId: string,
    connectionId: string,
  ): Promise<string | null> {
    const existing = this.sockets.get(tenantId);
    if (existing) {
      if (existing.status === ConnectionStatus.CONNECTED) return null;
      if (existing.reconnecting) return null; // Prevent race condition during reconnect
      existing.socket.end(undefined);
      this.sockets.delete(tenantId);
    }

    const sessionPath = path.join(this.sessionsDir, tenantId);
    const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
    const { version } = await fetchLatestBaileysVersion();

    // FIX 1: Use makeCacheableSignalKeyStore for better performance and reliability
    const socket = makeWASocket({
      version,
      logger: baileysLogger,
      auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore(state.keys, baileysLogger),
      },
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
      reconnecting: false,
      lidToPhone: new Map(),
    };
    this.sockets.set(tenantId, tenantSocket);

    // FIX 6: Use ev.process() for batch event processing
    socket.ev.process(async (events) => {
      // ── Connection updates ──
      if (events['connection.update']) {
        const { connection, lastDisconnect, qr } = events['connection.update'];

        if (qr) {
          tenantSocket.qrCode = await QRCode.toDataURL(qr);
          tenantSocket.status = ConnectionStatus.PENDING;
          this.emit('qr', { tenantId, qrCode: tenantSocket.qrCode });
          this.logger.log(`QR code generated for tenant ${tenantId}`);
        }

        if (connection === 'open') {
          tenantSocket.qrCode = null;
          tenantSocket.status = ConnectionStatus.CONNECTED;
          tenantSocket.retryCount = 0;
          tenantSocket.reconnecting = false;

          const phoneNumber = socket.user?.id?.split(':')[0] || undefined;
          const pushName = socket.user?.name || undefined;

          await this.connectionRepo.update(connectionId, {
            status: ConnectionStatus.CONNECTED,
            phoneNumber,
            pushName,
          });

          this.emit('connected', { tenantId, phoneNumber, pushName });
          this.logger.log(
            `WhatsApp connected for tenant ${tenantId} (${phoneNumber})`,
          );
        }

        if (connection === 'close') {
          const error = lastDisconnect?.error as Boom;
          const statusCode = error?.output?.statusCode;
          const isLoggedOut = statusCode === DisconnectReason.loggedOut;

          tenantSocket.status = ConnectionStatus.DISCONNECTED;
          tenantSocket.retryCount++;

          // FIX 2: Simplified reconnection logic matching Baileys docs
          // Reconnect for any reason EXCEPT explicit logout, with a max retry limit
          const shouldReconnect = !isLoggedOut && tenantSocket.retryCount <= 10;

          if (shouldReconnect) {
            // FIX 5: Use reconnecting flag to prevent race conditions
            tenantSocket.reconnecting = true;
            const delay = Math.min(tenantSocket.retryCount * 2000, 20000); // Exponential backoff, max 20s
            this.logger.warn(
              `Reconnecting WhatsApp for tenant ${tenantId} (code: ${statusCode}, attempt: ${tenantSocket.retryCount}, delay: ${delay}ms)`,
            );
            setTimeout(async () => {
              // Only reconnect if this tenant socket is still the current one
              const current = this.sockets.get(tenantId);
              if (current === tenantSocket) {
                this.sockets.delete(tenantId);
                try {
                  await this.connect(tenantId, connectionId);
                } catch (err) {
                  this.logger.error(
                    `Reconnection failed for ${tenantId}: ${err.message}`,
                  );
                }
              }
            }, delay);
          } else {
            this.logger.warn(
              `WhatsApp disconnected for tenant ${tenantId} (code: ${statusCode}, loggedOut: ${isLoggedOut})`,
            );
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
      }

      // ── Save credentials ──
      if (events['creds.update']) {
        await saveCreds();
      }

      // ── Build LID → Phone mapping from contacts ──
      if (events['contacts.upsert']) {
        for (const contact of events['contacts.upsert']) {
          const id = contact.id;
          const lid = (contact as any).lid;
          if (lid && id && id.endsWith('@s.whatsapp.net')) {
            tenantSocket.lidToPhone.set(lid, id);
          }
        }
        this.logger.log(
          `[LID MAP] Total mappings: ${tenantSocket.lidToPhone.size}`,
        );
      }

      if (events['contacts.update']) {
        for (const update of events['contacts.update']) {
          const id = update.id;
          const lid = (update as any).lid;
          if (lid && id && id.endsWith('@s.whatsapp.net')) {
            tenantSocket.lidToPhone.set(lid, id);
          }
        }
      }

      // ── Incoming messages ──
      if (events['messages.upsert']) {
        const { messages, type } = events['messages.upsert'];

        if (type !== 'notify') return;

        for (const msg of messages) {
          if (!msg.message) continue;

          if (msg.key.fromMe) {
            // Capture LID mappings from own message echoes
            const ownJid = msg.key.remoteJid || '';
            if (ownJid.endsWith('@lid')) {
              const externalId = msg.key.id;
              if (externalId) {
                try {
                  const outbound = await this.messageRepo.findOne({
                    where: { tenantId, externalId },
                    select: ['remoteJid', 'remotePhone'],
                  });
                  if (
                    outbound &&
                    outbound.remoteJid.endsWith('@s.whatsapp.net')
                  ) {
                    tenantSocket.lidToPhone.set(ownJid, outbound.remoteJid);
                    this.logger.log(
                      `[LID MAP] Captured from own msg echo: ${ownJid} → ${outbound.remoteJid}`,
                    );
                  }
                } catch {
                  /* ignore */
                }
              }
            }
            continue;
          }

          const remoteJid = msg.key.remoteJid || '';
          const isPersonalChat =
            remoteJid.endsWith('@s.whatsapp.net') || remoteJid.endsWith('@lid');
          if (!isPersonalChat) continue;

          // For @lid JIDs, try to resolve to the real phone JID
          let resolvedJid = remoteJid;
          if (remoteJid.endsWith('@lid')) {
            resolvedJid = await this.resolveLidJid(
              tenantId,
              tenantSocket,
              remoteJid,
              msg,
            );
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
            (innerMessage.audioMessage || innerMessage.pttMessage
              ? '[audio]'
              : '') ||
            (innerMessage.stickerMessage ? '[sticker]' : '') ||
            (innerMessage.documentMessage ? '[documento]' : '') ||
            (innerMessage.locationMessage ? '[localizacao]' : '') ||
            (innerMessage.contactMessage || innerMessage.contactsArrayMessage
              ? '[contato]'
              : '') ||
            '[midia]';
          const remoteName = msg.pushName || undefined;

          this.logger.log(
            `Incoming message from ${remotePhone} (${remoteName || 'unknown'}): type=${this.getMessageType(innerMessage)}, content="${content.substring(0, 50)}"`,
          );

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
              readByUser: false,
            });
            const saved = await this.messageRepo.save(entity);

            this.logger.log(`Incoming message saved with id=${saved.id}`);
            this.emit('message', { tenantId, message: saved });
          } catch (err) {
            this.logger.error(
              `Failed to save incoming message: ${err.message}`,
            );
          }
        }
      }

      // ── Message status updates ──
      if (events['messages.update']) {
        for (const update of events['messages.update']) {
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
      }
    });

    return tenantSocket.qrCode;
  }

  // ── Send message ──

  async sendMessage(
    tenantId: string,
    phone: string,
    content: string,
    quotedId?: string,
  ) {
    const ts = this.sockets.get(tenantId);
    if (!ts || ts.status !== ConnectionStatus.CONNECTED) {
      throw new Error('WhatsApp nao conectado');
    }

    const clean = phone.replace(/\D/g, '');
    const isLid = clean.length > 13;
    let jid: string;

    if (isLid) {
      jid = `${clean}@lid`;
      this.logger.log(`Sending to LID contact: ${jid}`);
    } else {
      const normalizedPhone = this.normalizePhone(phone);
      jid = `${normalizedPhone}@s.whatsapp.net`;

      // Verify the number exists on WhatsApp and get correct JID
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
        this.logger.warn(
          `onWhatsApp check failed for ${jid}: ${err.message}, proceeding anyway`,
        );
      }
    }

    const remotePhone = jid.split('@')[0];

    this.logger.log(`Sending message to ${jid} (input: ${phone})`);

    const quoted = quotedId
      ? { key: { remoteJid: jid, id: quotedId, fromMe: false } }
      : undefined;

    try {
      const sent = await ts.socket.sendMessage(jid, { text: content }, {
        quoted,
      } as any);

      this.logger.log(`Message sent to ${jid}, externalId: ${sent?.key?.id}`);

      // If the sent key contains a different remoteJid (e.g. LID), save the mapping
      if (sent?.key?.remoteJid && sent.key.remoteJid !== jid) {
        const sentJid = sent.key.remoteJid;
        if (sentJid.endsWith('@lid')) {
          ts.lidToPhone.set(sentJid, jid);
          this.logger.log(
            `[LID MAP] Captured from sendMessage: ${sentJid} → ${jid}`,
          );
        } else if (
          jid.endsWith('@lid') &&
          sentJid.endsWith('@s.whatsapp.net')
        ) {
          ts.lidToPhone.set(jid, sentJid);
          this.logger.log(
            `[LID MAP] Captured from sendMessage: ${jid} → ${sentJid}`,
          );
        }
      }

      // Look up existing remoteName for this contact
      const existingMsg = await this.messageRepo.findOne({
        where: { tenantId, remotePhone },
        select: ['remoteName'],
        order: { createdAt: 'DESC' },
      });

      const entity = this.messageRepo.create({
        tenantId,
        connectionId: ts.connectionId,
        remoteJid: jid,
        remotePhone,
        remoteName: existingMsg?.remoteName || undefined,
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

    // FIX 4: Wrap logout in try/catch to ensure cleanup always runs
    try {
      await ts.socket.logout();
    } catch (err) {
      this.logger.warn(`Logout failed for tenant ${tenantId}: ${err.message}`);
    }

    try {
      ts.socket.end(undefined);
    } catch {
      /* ignore */
    }

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

  /** Resolve a LID JID to a phone JID using the runtime mapping */
  resolveLid(tenantId: string, lidJid: string): string | null {
    const ts = this.sockets.get(tenantId);
    if (!ts) return null;
    return ts.lidToPhone.get(lidJid) || null;
  }

  // ── Helpers ──

  /** Normalize any phone input to full international digits (e.g. 5511999998888) */
  normalizePhone(phone: string): string {
    const clean = phone.replace(/\D/g, '');
    if (clean.length === 13 && clean.startsWith('55')) return clean;
    if (clean.length === 11) return `55${clean}`;
    if (clean.length === 12 && clean.startsWith('55')) return clean;
    if (clean.length === 10) return `55${clean}`;
    return clean;
  }

  /**
   * Resolve a LID JID to its phone JID using multiple strategies.
   * Returns the phone JID if found, or the original LID JID if not.
   */
  private async resolveLidJid(
    tenantId: string,
    ts: TenantSocket,
    lidJid: string,
    msg: any,
  ): Promise<string> {
    // Strategy 1: In-memory LID map (built from contacts.upsert and sendMessage echoes)
    const fromMap = ts.lidToPhone.get(lidJid);
    if (fromMap) {
      this.logger.log(`[LID] Resolved from map: ${lidJid} → ${fromMap}`);
      return fromMap;
    }

    this.logger.warn(
      `[LID] ${lidJid} not in map (size: ${ts.lidToPhone.size}), trying other strategies...`,
    );

    // Strategy 2: msg.key.participant (sometimes has phone JID in group-like contexts)
    const participant = msg.key?.participant;
    if (participant && participant.endsWith('@s.whatsapp.net')) {
      ts.lidToPhone.set(lidJid, participant);
      this.logger.log(
        `[LID] Resolved via participant: ${lidJid} → ${participant}`,
      );
      return participant;
    }

    // Strategy 3: Already-resolved LID messages in DB (from a previous resolution)
    try {
      const prevResolved = await this.messageRepo.findOne({
        where: { tenantId, remoteJid: lidJid },
        select: ['remotePhone'],
      });
      if (prevResolved && prevResolved.remotePhone.length <= 13) {
        const phoneJid = `${prevResolved.remotePhone}@s.whatsapp.net`;
        ts.lidToPhone.set(lidJid, phoneJid);
        this.logger.log(
          `[LID] Resolved from DB (prev msg): ${lidJid} → ${phoneJid}`,
        );
        return phoneJid;
      }
    } catch (err) {
      this.logger.warn(`[LID] DB lookup failed: ${err.message}`);
    }

    // Strategy 4: If the message is a reply (has contextInfo.stanzaId), find the original outbound
    try {
      const innerMsg = this.extractInnerMessage(msg.message);
      const quotedId =
        innerMsg?.extendedTextMessage?.contextInfo?.stanzaId ||
        innerMsg?.contextInfo?.stanzaId;
      if (quotedId) {
        const quotedMsg = await this.messageRepo.findOne({
          where: { tenantId, externalId: quotedId },
          select: ['remoteJid', 'remotePhone'],
        });
        if (quotedMsg && quotedMsg.remoteJid.endsWith('@s.whatsapp.net')) {
          ts.lidToPhone.set(lidJid, quotedMsg.remoteJid);
          this.logger.log(
            `[LID] Resolved via quoted msg: ${lidJid} → ${quotedMsg.remoteJid}`,
          );
          return quotedMsg.remoteJid;
        }
      }
    } catch (err) {
      this.logger.warn(`[LID] Quoted msg lookup failed: ${err.message}`);
    }

    // FIX 7: Removed Strategy 5 (guessing from recent unanswered outbound) — too unreliable
    // with multiple concurrent conversations, can map LIDs to the wrong contacts

    this.logger.warn(`[LID] Could not resolve ${lidJid}, saving as-is`);
    return lidJid;
  }

  /** Unwrap nested message containers (ephemeral, viewOnce, edited, etc.) */
  private extractInnerMessage(message: any): any {
    if (!message) return {};
    if (message.ephemeralMessage?.message) {
      return this.extractInnerMessage(message.ephemeralMessage.message);
    }
    if (message.viewOnceMessage?.message) {
      return this.extractInnerMessage(message.viewOnceMessage.message);
    }
    if (message.viewOnceMessageV2?.message) {
      return this.extractInnerMessage(message.viewOnceMessageV2.message);
    }
    if (message.editedMessage?.message) {
      return this.extractInnerMessage(message.editedMessage.message);
    }
    if (message.documentWithCaptionMessage?.message) {
      return this.extractInnerMessage(
        message.documentWithCaptionMessage.message,
      );
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
