import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, ILike } from 'typeorm';
import { WhatsappConnection, ConnectionStatus } from './entities/whatsapp-connection.entity';
import { WhatsappMessage } from './entities/whatsapp-message.entity';
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

    const live = this.evolution.getStatus(tenantId);
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

    const live = this.evolution.getStatus(tenantId);
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

  async sendMessage(tenantId: string, phone: string, content: string, quotedId?: string) {
    if (!this.evolution.isConnected(tenantId)) {
      throw new BadRequestException('WhatsApp não está conectado. Conecte primeiro.');
    }
    return this.evolution.sendMessage(tenantId, phone, content, quotedId);
  }

  async broadcast(tenantId: string, phones: string[], content: string) {
    if (!this.evolution.isConnected(tenantId)) {
      throw new BadRequestException('WhatsApp não está conectado.');
    }
    if (phones.length > 100) {
      throw new BadRequestException('Máximo de 100 destinatários por broadcast.');
    }
    return this.evolution.broadcast(tenantId, phones, content);
  }

  // ── Webhook ──

  async handleWebhook(tenantId: string, body: any) {
    const event = body.event;
    const data = body.data;

    if (!event) {
      this.logger.warn(`Webhook without event for tenant ${tenantId}`);
      return;
    }

    await this.evolution.handleWebhook(tenantId, event, data);
  }

  // ── Message History ──

  async getChats(tenantId: string, page = 1, limit = 30) {
    // Group by remotePhone to merge conversations
    const chats = await this.messageRepo
      .createQueryBuilder('m')
      .select('m."remotePhone"', 'remotePhone')
      .addSelect('MAX(m."remoteJid")', 'remoteJid')
      .addSelect('MAX(m."remoteName")', 'remoteName')
      .addSelect('MAX(m."createdAt")', 'lastMessageAt')
      .addSelect('COUNT(*)::int', 'messageCount')
      .addSelect(
        `SUM(CASE WHEN m.direction = 'INBOUND' AND m.status != 'READ' THEN 1 ELSE 0 END)::int`,
        'unreadCount',
      )
      .where('m."tenantId" = :tenantId', { tenantId })
      .groupBy('m."remotePhone"')
      .orderBy('"lastMessageAt"', 'DESC')
      .offset((page - 1) * limit)
      .limit(limit)
      .getRawMany();

    // Fetch last message content for each chat
    for (const chat of chats) {
      const lastMsg = await this.messageRepo.findOne({
        where: { tenantId, remotePhone: chat.remotePhone },
        order: { createdAt: 'DESC' },
        select: ['content'],
      });
      chat.lastMessage = lastMsg?.content || '';
    }

    this.logger.log(`getChats for tenant ${tenantId}: found ${chats.length} chats`);
    return chats;
  }

  async getChatMessages(tenantId: string, remotePhone: string, page = 1, limit = 50) {
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
}
