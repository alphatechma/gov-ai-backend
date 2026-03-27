import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, ILike, MoreThanOrEqual } from 'typeorm';
import {
  WhatsappConnection,
  ConnectionStatus,
} from './entities/whatsapp-connection.entity';
import {
  WhatsappMessage,
  MessageDirection,
} from './entities/whatsapp-message.entity';
import { WhatsappEvolutionService } from './whatsapp-evolution.service';

@Injectable()
export class WhatsappService {
  private readonly logger = new Logger(WhatsappService.name);

  constructor(
    @InjectRepository(WhatsappConnection)
    private connectionRepo: Repository<WhatsappConnection>,
    @InjectRepository(WhatsappMessage)
    private messageRepo: Repository<WhatsappMessage>,
    private evolution: WhatsappEvolutionService,
  ) {}

  // ── Connection Management ──

  async getConnection(tenantId: string) {
    const conn = await this.connectionRepo.findOne({ where: { tenantId } });
    if (!conn) return null;

    const live = await this.evolution.getStatus(tenantId);
    return {
      ...conn,
      liveStatus: live.status,
      qrCode: live.qrCode,
    };
  }

  async startConnection(tenantId: string, userId: string) {
    let conn = await this.connectionRepo.findOne({ where: { tenantId } });

    if (!conn) {
      conn = await this.connectionRepo.save(
        this.connectionRepo.create({
          tenantId,
          status: ConnectionStatus.PENDING,
          connectedBy: userId,
        }),
      );
    } else {
      await this.connectionRepo.update(conn.id, {
        status: ConnectionStatus.PENDING,
        connectedBy: userId,
      });
      conn.status = ConnectionStatus.PENDING;
    }

    await this.evolution.connect(tenantId, conn.id);

    const live = await this.evolution.getStatus(tenantId);
    return {
      connectionId: conn.id,
      status: live.status,
      qrCode: live.qrCode,
    };
  }

  async disconnectConnection(tenantId: string) {
    await this.evolution.disconnect(tenantId);
    return { message: 'Desconectado com sucesso' };
  }

  // ── Messaging ──

  async sendMessage(
    tenantId: string,
    phone: string,
    content: string,
    quotedId?: string,
  ) {
    if (!(await this.evolution.isConnected(tenantId))) {
      throw new BadRequestException(
        'WhatsApp não está conectado. Conecte primeiro.',
      );
    }
    return this.evolution.sendMessage(tenantId, phone, content, quotedId);
  }

  async sendMedia(
    tenantId: string,
    phone: string,
    file: { buffer: Buffer; mimetype: string; originalname: string },
    caption?: string,
  ) {
    if (!(await this.evolution.isConnected(tenantId))) {
      throw new BadRequestException(
        'WhatsApp não está conectado. Conecte primeiro.',
      );
    }
    return this.evolution.sendMedia(
      tenantId,
      phone,
      file.buffer,
      file.mimetype,
      file.originalname,
      caption,
    );
  }

  async broadcast(tenantId: string, phones: string[], content: string) {
    if (!(await this.evolution.isConnected(tenantId))) {
      throw new BadRequestException('WhatsApp não está conectado.');
    }
    if (phones.length > 100) {
      throw new BadRequestException(
        'Máximo de 100 destinatários por broadcast.',
      );
    }
    return this.evolution.broadcast(tenantId, phones, content);
  }

  // ── Media Proxy ──

  async getMediaForMessage(
    tenantId: string,
    messageId: string,
  ): Promise<{ base64: string; mimetype: string } | null> {
    const msg = await this.messageRepo.findOne({
      where: { id: messageId, tenantId },
    });
    if (!msg || !msg.externalId) return null;

    return this.evolution.getMediaBase64(
      tenantId,
      msg.externalId,
      msg.remoteJid,
    );
  }

  // ── Webhook ──

  async handleWebhook(tenantId: string, body: any) {
    const rawEvent = body.event;
    const data = body.data;

    if (!rawEvent) {
      this.logger.warn(
        `Webhook without event for tenant ${tenantId}. Keys: ${Object.keys(body).join(', ')}`,
      );
      return;
    }

    // Normalize event name: Evolution v2 may send "messages.upsert" or "MESSAGES_UPSERT"
    const event = rawEvent.toUpperCase().replace(/\./g, '_');

    this.logger.log(
      `Webhook received: raw="${rawEvent}" normalized="${event}" tenant=${tenantId}`,
    );

    await this.evolution.handleWebhook(tenantId, event, data);
  }

  // ── Message History ──

  async getChats(
    tenantId: string,
    page = 1,
    limit = 30,
    filter: 'all' | 'unread' | 'reply-later' = 'all',
  ) {
    // Group by remotePhone to merge conversations
    const qb = this.messageRepo
      .createQueryBuilder('m')
      .select('m."remotePhone"', 'remotePhone')
      .addSelect('MAX(m."remoteJid")', 'remoteJid')
      .addSelect('MAX(m."remoteName")', 'remoteName')
      .addSelect('MAX(m."createdAt")', 'lastMessageAt')
      .addSelect('COUNT(*)::int', 'messageCount')
      .addSelect(
        `SUM(CASE WHEN m.direction = 'INBOUND' AND m."readByUser" = false THEN 1 ELSE 0 END)::int`,
        'unreadCount',
      )
      .addSelect(
        `BOOL_OR(m."replyLater")`,
        'replyLater',
      )
      .where('m."tenantId" = :tenantId', { tenantId })
      .groupBy('m."remotePhone"')
      .orderBy('"lastMessageAt"', 'DESC')
      .offset((page - 1) * limit)
      .limit(limit);

    if (filter === 'unread') {
      qb.having(
        `SUM(CASE WHEN m.direction = 'INBOUND' AND m."readByUser" = false THEN 1 ELSE 0 END) > 0`,
      );
    } else if (filter === 'reply-later') {
      qb.having(`BOOL_OR(m."replyLater") = true`);
    }

    const chats = await qb.getRawMany();

    // Fetch last message content for each chat
    for (const chat of chats) {
      const lastMsg = await this.messageRepo.findOne({
        where: { tenantId, remotePhone: chat.remotePhone },
        order: { createdAt: 'DESC' },
        select: ['content'],
      });
      chat.lastMessage = lastMsg?.content || '';
    }

    this.logger.log(
      `getChats for tenant ${tenantId}: found ${chats.length} chats (filter=${filter})`,
    );
    return chats;
  }

  async markChatRead(tenantId: string, phone: string) {
    const clean = phone.replace(/\D/g, '');
    await this.messageRepo.update(
      { tenantId, remotePhone: clean, direction: MessageDirection.INBOUND, readByUser: false },
      { readByUser: true },
    );
  }

  async markChatUnread(tenantId: string, phone: string) {
    const clean = phone.replace(/\D/g, '');
    // Mark the last INBOUND message as unread
    const lastInbound = await this.messageRepo.findOne({
      where: { tenantId, remotePhone: clean, direction: MessageDirection.INBOUND },
      order: { createdAt: 'DESC' },
    });
    if (lastInbound) {
      await this.messageRepo.update(lastInbound.id, { readByUser: false });
    }
  }

  async toggleReplyLater(tenantId: string, phone: string) {
    const clean = phone.replace(/\D/g, '');
    // Check current state from the latest message
    const latest = await this.messageRepo.findOne({
      where: { tenantId, remotePhone: clean },
      order: { createdAt: 'DESC' },
    });
    if (!latest) return { replyLater: false };

    const newValue = !latest.replyLater;
    // Set replyLater on all messages for this chat (so BOOL_OR aggregation works)
    await this.messageRepo.update(
      { tenantId, remotePhone: clean },
      { replyLater: newValue },
    );
    return { replyLater: newValue };
  }

  async getChatMessages(
    tenantId: string,
    remotePhone: string,
    page = 1,
    limit = 50,
  ) {
    const clean = remotePhone.replace(/\D/g, '');

    const [messages, total] = await this.messageRepo.findAndCount({
      where: { tenantId, remotePhone: clean },
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    return {
      messages: messages.reverse(),
      total,
      page,
      totalPages: Math.ceil(total / limit),
    };
  }

  async searchMessages(tenantId: string, query: string, limit = 20) {
    const escaped = query.replace(/[%_]/g, '\\$&');
    return this.messageRepo.find({
      where: {
        tenantId,
        content: ILike(`%${escaped}%`),
      },
      order: { createdAt: 'DESC' },
      take: limit,
    });
  }

  async getAnalytics(tenantId: string, days = 30) {
    const since = new Date();
    since.setDate(since.getDate() - days);
    since.setHours(0, 0, 0, 0);

    const qb = this.messageRepo.createQueryBuilder('m')
      .where('m."tenantId" = :tenantId', { tenantId })
      .andWhere('m."createdAt" >= :since', { since });

    // KPIs
    const kpis = await qb.clone()
      .select(`COUNT(*)::int`, 'total')
      .addSelect(`SUM(CASE WHEN m.direction = 'INBOUND' THEN 1 ELSE 0 END)::int`, 'inbound')
      .addSelect(`SUM(CASE WHEN m.direction = 'OUTBOUND' THEN 1 ELSE 0 END)::int`, 'outbound')
      .addSelect(`COUNT(DISTINCT m."remotePhone")::int`, 'activeContacts')
      .addSelect(
        `SUM(CASE WHEN m.direction = 'INBOUND' AND m."readByUser" = false THEN 1 ELSE 0 END)::int`,
        'unread',
      )
      .getRawOne();

    // Reply-later count (distinct contacts)
    const replyLaterResult = await this.messageRepo.createQueryBuilder('m')
      .select('COUNT(DISTINCT m."remotePhone")::int', 'count')
      .where('m."tenantId" = :tenantId', { tenantId })
      .andWhere('m."replyLater" = true')
      .getRawOne();

    // Volume by day
    const volumeByDay = await qb.clone()
      .select(`DATE(m."createdAt")`, 'date')
      .addSelect(`SUM(CASE WHEN m.direction = 'INBOUND' THEN 1 ELSE 0 END)::int`, 'inbound')
      .addSelect(`SUM(CASE WHEN m.direction = 'OUTBOUND' THEN 1 ELSE 0 END)::int`, 'outbound')
      .groupBy(`DATE(m."createdAt")`)
      .orderBy(`DATE(m."createdAt")`, 'ASC')
      .getRawMany();

    // Peak hours
    const peakHours = await qb.clone()
      .select(`EXTRACT(HOUR FROM m."createdAt")::int`, 'hour')
      .addSelect(`COUNT(*)::int`, 'count')
      .groupBy(`EXTRACT(HOUR FROM m."createdAt")`)
      .orderBy('hour', 'ASC')
      .getRawMany();

    // Message types
    const messageTypes = await qb.clone()
      .select('m.type', 'type')
      .addSelect('COUNT(*)::int', 'count')
      .groupBy('m.type')
      .orderBy('count', 'DESC')
      .getRawMany();

    // Top 10 contacts
    const topContacts = await qb.clone()
      .select('m."remotePhone"', 'phone')
      .addSelect('MAX(m."remoteName")', 'name')
      .addSelect('COUNT(*)::int', 'total')
      .addSelect(`SUM(CASE WHEN m.direction = 'INBOUND' THEN 1 ELSE 0 END)::int`, 'inbound')
      .addSelect(`SUM(CASE WHEN m.direction = 'OUTBOUND' THEN 1 ELSE 0 END)::int`, 'outbound')
      .groupBy('m."remotePhone"')
      .orderBy('total', 'DESC')
      .limit(10)
      .getRawMany();

    // Response rate: % of contacts who received at least 1 OUTBOUND among those with INBOUND
    const responseRate = await qb.clone()
      .select(`COUNT(DISTINCT CASE WHEN m.direction = 'INBOUND' THEN m."remotePhone" END)::int`, 'withInbound')
      .addSelect(
        `COUNT(DISTINCT CASE WHEN m.direction = 'OUTBOUND' AND m."remotePhone" IN (
          SELECT DISTINCT m2."remotePhone" FROM whatsapp_messages m2
          WHERE m2."tenantId" = m."tenantId" AND m2.direction = 'INBOUND' AND m2."createdAt" >= :since
        ) THEN m."remotePhone" END)::int`,
        'withResponse',
      )
      .getRawOne();

    // Last 10 messages
    const recentMessages = await this.messageRepo.find({
      where: { tenantId },
      order: { createdAt: 'DESC' },
      take: 10,
      select: ['id', 'remotePhone', 'remoteName', 'content', 'type', 'direction', 'status', 'createdAt'],
    });

    return {
      kpis: {
        total: kpis?.total || 0,
        inbound: kpis?.inbound || 0,
        outbound: kpis?.outbound || 0,
        activeContacts: kpis?.activeContacts || 0,
        unread: kpis?.unread || 0,
        replyLater: replyLaterResult?.count || 0,
        responseRate: kpis?.total > 0 && responseRate?.withInbound > 0
          ? Math.round((responseRate.withResponse / responseRate.withInbound) * 100)
          : 0,
      },
      volumeByDay,
      peakHours,
      messageTypes,
      topContacts,
      recentMessages,
    };
  }
}
