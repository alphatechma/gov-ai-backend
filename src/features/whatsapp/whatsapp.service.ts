import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, ILike } from 'typeorm';
import { WhatsappConnection, ConnectionStatus } from './entities/whatsapp-connection.entity';
import { WhatsappMessage } from './entities/whatsapp-message.entity';
import { WhatsappBaileysService } from './whatsapp-baileys.service';

@Injectable()
export class WhatsappService {
  private readonly logger = new Logger(WhatsappService.name);

  constructor(
    @InjectRepository(WhatsappConnection)
    private connectionRepo: Repository<WhatsappConnection>,
    @InjectRepository(WhatsappMessage)
    private messageRepo: Repository<WhatsappMessage>,
    private baileys: WhatsappBaileysService,
  ) {}

  // ── Connection Management ──

  async getConnection(tenantId: string) {
    const conn = await this.connectionRepo.findOne({ where: { tenantId } });
    if (!conn) return null;

    const live = this.baileys.getStatus(tenantId);
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

    await this.baileys.connect(tenantId, conn.id);

    const live = this.baileys.getStatus(tenantId);
    return {
      connectionId: conn.id,
      status: live.status,
      qrCode: live.qrCode,
    };
  }

  async disconnectConnection(tenantId: string) {
    await this.baileys.disconnect(tenantId);
    return { message: 'Desconectado com sucesso' };
  }

  // ── Messaging ──

  async sendMessage(tenantId: string, phone: string, content: string, quotedId?: string) {
    if (!this.baileys.isConnected(tenantId)) {
      throw new BadRequestException('WhatsApp nao esta conectado. Conecte primeiro.');
    }
    return this.baileys.sendMessage(tenantId, phone, content, quotedId);
  }

  async broadcast(tenantId: string, phones: string[], content: string) {
    if (!this.baileys.isConnected(tenantId)) {
      throw new BadRequestException('WhatsApp nao esta conectado.');
    }
    if (phones.length > 100) {
      throw new BadRequestException('Maximo de 100 destinatarios por broadcast.');
    }
    return this.baileys.broadcast(tenantId, phones, content);
  }

  // ── Message History ──

  async getChats(tenantId: string, page = 1, limit = 30) {
    // Group by remoteJid only (not remotePhone, which may be inconsistent for old data)
    const chats = await this.messageRepo
      .createQueryBuilder('m')
      .select('m."remoteJid"', 'remoteJid')
      .addSelect('MAX(m."remoteName")', 'remoteName')
      .addSelect('MAX(m."createdAt")', 'lastMessageAt')
      .addSelect('COUNT(*)::int', 'messageCount')
      .addSelect(
        `SUM(CASE WHEN m.direction = 'INBOUND' AND m.status != 'READ' THEN 1 ELSE 0 END)::int`,
        'unreadCount',
      )
      .where('m."tenantId" = :tenantId', { tenantId })
      .groupBy('m."remoteJid"')
      .orderBy('"lastMessageAt"', 'DESC')
      .offset((page - 1) * limit)
      .limit(limit)
      .getRawMany();

    // Derive remotePhone from JID + fetch last message content
    for (const chat of chats) {
      // Extract phone from JID: "5511999998888@s.whatsapp.net" → "5511999998888"
      chat.remotePhone = chat.remoteJid?.split('@')[0] || '';

      const lastMsg = await this.messageRepo.findOne({
        where: { tenantId, remoteJid: chat.remoteJid },
        order: { createdAt: 'DESC' },
        select: ['content'],
      });
      chat.lastMessage = lastMsg?.content || '';
    }

    this.logger.log(`getChats for tenant ${tenantId}: found ${chats.length} chats`);
    return chats;
  }

  async getChatMessages(tenantId: string, remotePhone: string, page = 1, limit = 50) {
    // Determine JID: could be a phone number or a LID
    // Brazilian phones are max 13 digits (55 + 2 area + 9 number), anything longer is a LID
    let jid: string;
    const clean = remotePhone.replace(/\D/g, '');
    if (clean.length > 13) {
      jid = `${clean}@lid`;
    } else {
      const normalizedPhone = this.baileys.normalizePhone(remotePhone);
      jid = `${normalizedPhone}@s.whatsapp.net`;
    }

    this.logger.log(`getChatMessages: input=${remotePhone}, jid=${jid}`);

    const [messages, total] = await this.messageRepo.findAndCount({
      where: { tenantId, remoteJid: jid },
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    this.logger.log(`getChatMessages: found ${total} messages for jid=${jid}`);

    return {
      messages: messages.reverse(),
      total,
      page,
      totalPages: Math.ceil(total / limit),
    };
  }

  // DEBUG: remove after testing
  async debugMessages(tenantId: string) {
    const messages = await this.messageRepo.find({
      where: { tenantId },
      order: { createdAt: 'DESC' },
      take: 20,
      select: ['id', 'remoteJid', 'remotePhone', 'remoteName', 'content', 'direction', 'status', 'createdAt'],
    });
    return {
      count: messages.length,
      messages: messages.map(m => ({
        id: m.id,
        jid: m.remoteJid,
        phone: m.remotePhone,
        name: m.remoteName,
        content: m.content?.substring(0, 50),
        direction: m.direction,
        status: m.status,
        createdAt: m.createdAt,
      })),
    };
  }

  async searchMessages(tenantId: string, query: string, limit = 20) {
    return this.messageRepo.find({
      where: {
        tenantId,
        content: ILike(`%${query}%`),
      },
      order: { createdAt: 'DESC' },
      take: limit,
    });
  }
}
