import {
  Injectable,
  Logger,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, ILike } from 'typeorm';
import * as ExcelJS from 'exceljs';
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

  // ── Connection Management (multi-instance) ──

  /** List all WhatsApp connections for a tenant with live status. */
  async listConnections(tenantId: string) {
    const conns = await this.connectionRepo.find({
      where: { tenantId },
      order: { isDefault: 'DESC', createdAt: 'ASC' },
    });

    const result: any[] = [];
    for (const conn of conns) {
      const live = await this.evolution.getStatus(conn.id);
      result.push({
        ...conn,
        liveStatus: live.status,
        qrCode: live.qrCode,
      });
    }
    return result;
  }

  /** Fetch a single connection with ownership check. */
  async getConnectionById(tenantId: string, connectionId: string) {
    const conn = await this.connectionRepo.findOne({
      where: { id: connectionId, tenantId },
    });
    if (!conn) throw new NotFoundException('Conexão não encontrada');

    const live = await this.evolution.getStatus(conn.id);
    return {
      ...conn,
      liveStatus: live.status,
      qrCode: live.qrCode,
    };
  }

  /**
   * Create a brand new connection and initiate QR pairing.
   * If the tenant has no existing connection, marks this one as default.
   */
  async createConnection(
    tenantId: string,
    userId: string,
    label?: string,
  ) {
    const existingCount = await this.connectionRepo.count({
      where: { tenantId },
    });

    const entity = this.connectionRepo.create({
      tenantId,
      label: label || undefined,
      isDefault: existingCount === 0,
      status: ConnectionStatus.PENDING,
      connectedBy: userId,
    });
    const conn = await this.connectionRepo.save(entity);

    const qrCode = await this.evolution.connect(conn.id);
    const live = await this.evolution.getStatus(conn.id);

    return {
      connectionId: conn.id,
      status: live.status,
      qrCode: qrCode ?? live.qrCode,
    };
  }

  /** Start/reconnect an existing connection (re-fetch QR code). */
  async startConnection(
    tenantId: string,
    connectionId: string,
    userId: string,
  ) {
    const conn = await this.connectionRepo.findOne({
      where: { id: connectionId, tenantId },
    });
    if (!conn) throw new NotFoundException('Conexão não encontrada');

    await this.connectionRepo.update(conn.id, {
      status: ConnectionStatus.PENDING,
      connectedBy: userId,
    });

    const qrCode = await this.evolution.connect(conn.id);
    const live = await this.evolution.getStatus(conn.id);

    return {
      connectionId: conn.id,
      status: live.status,
      qrCode: qrCode ?? live.qrCode,
    };
  }

  /** Update connection metadata (label, default flag). */
  async updateConnection(
    tenantId: string,
    connectionId: string,
    dto: { label?: string; isDefault?: boolean },
  ) {
    const conn = await this.connectionRepo.findOne({
      where: { id: connectionId, tenantId },
    });
    if (!conn) throw new NotFoundException('Conexão não encontrada');

    if (dto.isDefault === true) {
      // Un-default all other connections for this tenant
      await this.connectionRepo.update(
        { tenantId, isDefault: true },
        { isDefault: false },
      );
    }

    await this.connectionRepo.update(connectionId, {
      ...(dto.label !== undefined && { label: dto.label }),
      ...(dto.isDefault !== undefined && { isDefault: dto.isDefault }),
    });

    return this.getConnectionById(tenantId, connectionId);
  }

  /** Disconnect a specific connection (logs out but keeps the DB row). */
  async disconnectConnection(tenantId: string, connectionId: string) {
    const conn = await this.connectionRepo.findOne({
      where: { id: connectionId, tenantId },
    });
    if (!conn) throw new NotFoundException('Conexão não encontrada');

    await this.evolution.disconnect(connectionId);
    return { message: 'Desconectado com sucesso' };
  }

  /** Fully delete a connection (disconnect + remove DB row). Messages are kept. */
  async deleteConnection(tenantId: string, connectionId: string) {
    const conn = await this.connectionRepo.findOne({
      where: { id: connectionId, tenantId },
    });
    if (!conn) throw new NotFoundException('Conexão não encontrada');

    await this.evolution.disconnect(connectionId);
    await this.connectionRepo.delete(connectionId);

    // If the deleted one was default, promote another to default
    if (conn.isDefault) {
      const next = await this.connectionRepo.findOne({
        where: { tenantId },
        order: { createdAt: 'ASC' },
      });
      if (next) {
        await this.connectionRepo.update(next.id, { isDefault: true });
      }
    }

    return { message: 'Conexão removida' };
  }

  /** Validates that the given connection belongs to the tenant. Returns the connection. */
  private async assertOwnership(
    tenantId: string,
    connectionId: string,
  ): Promise<WhatsappConnection> {
    const conn = await this.connectionRepo.findOne({
      where: { id: connectionId, tenantId },
    });
    if (!conn) throw new NotFoundException('Conexão não encontrada');
    return conn;
  }

  // ── Legacy singular endpoint (returns the default / first connection) ──

  async getConnection(tenantId: string) {
    const conn =
      (await this.connectionRepo.findOne({
        where: { tenantId, isDefault: true },
      })) ||
      (await this.connectionRepo.findOne({
        where: { tenantId },
        order: { createdAt: 'ASC' },
      }));

    if (!conn) return null;

    const live = await this.evolution.getStatus(conn.id);
    return {
      ...conn,
      liveStatus: live.status,
      qrCode: live.qrCode,
    };
  }

  /** Legacy start endpoint: creates first connection or reconnects existing default. */
  async legacyStartConnection(tenantId: string, userId: string) {
    const existing =
      (await this.connectionRepo.findOne({
        where: { tenantId, isDefault: true },
      })) ||
      (await this.connectionRepo.findOne({
        where: { tenantId },
        order: { createdAt: 'ASC' },
      }));

    if (existing) {
      return this.startConnection(tenantId, existing.id, userId);
    }
    return this.createConnection(tenantId, userId);
  }

  /** Legacy disconnect: disconnects the default connection. */
  async legacyDisconnect(tenantId: string) {
    const conn =
      (await this.connectionRepo.findOne({
        where: { tenantId, isDefault: true },
      })) ||
      (await this.connectionRepo.findOne({
        where: { tenantId },
        order: { createdAt: 'ASC' },
      }));
    if (!conn) return { message: 'Nenhuma conexão encontrada' };

    return this.disconnectConnection(tenantId, conn.id);
  }

  // ── Messaging ──

  async sendMessage(
    tenantId: string,
    connectionId: string,
    phone: string,
    content: string,
    quotedId?: string,
  ) {
    await this.assertOwnership(tenantId, connectionId);

    if (!(await this.evolution.isConnected(connectionId))) {
      throw new BadRequestException(
        'WhatsApp não está conectado. Conecte primeiro.',
      );
    }
    return this.evolution.sendMessage(connectionId, phone, content, quotedId);
  }

  async sendMedia(
    tenantId: string,
    connectionId: string,
    phone: string,
    file: { buffer: Buffer; mimetype: string; originalname: string },
    caption?: string,
  ) {
    await this.assertOwnership(tenantId, connectionId);

    if (!(await this.evolution.isConnected(connectionId))) {
      throw new BadRequestException(
        'WhatsApp não está conectado. Conecte primeiro.',
      );
    }
    return this.evolution.sendMedia(
      connectionId,
      phone,
      file.buffer,
      file.mimetype,
      file.originalname,
      caption,
    );
  }

  async broadcast(
    tenantId: string,
    connectionId: string,
    phones: string[],
    content: string,
  ) {
    await this.assertOwnership(tenantId, connectionId);

    if (!(await this.evolution.isConnected(connectionId))) {
      throw new BadRequestException('WhatsApp não está conectado.');
    }
    if (phones.length > 100) {
      throw new BadRequestException(
        'Máximo de 100 destinatários por broadcast.',
      );
    }
    return this.evolution.broadcast(connectionId, phones, content);
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
      msg.connectionId,
      msg.externalId,
      msg.remoteJid,
    );
  }

  // ── Webhook ──

  async handleWebhook(
    tenantId: string,
    connectionId: string | null,
    body: any,
  ) {
    const rawEvent = body.event;
    const data = body.data;

    if (!rawEvent) {
      this.logger.warn(
        `Webhook without event for tenant ${tenantId}. Keys: ${Object.keys(body).join(', ')}`,
      );
      return;
    }

    const event = rawEvent.toUpperCase().replace(/\./g, '_');

    this.logger.log(
      `Webhook: raw="${rawEvent}" event="${event}" tenant=${tenantId} connection=${connectionId ?? 'legacy'}`,
    );

    await this.evolution.handleWebhook(tenantId, connectionId, event, data);
  }

  // ── Message History ──

  /**
   * List chats grouped by (connectionId, remotePhone).
   * Same contact across different connections yields separate chat entries.
   */
  async getChats(
    tenantId: string,
    connectionId: string | undefined,
    page = 1,
    limit = 20,
    filter: 'all' | 'unread' | 'reply-later' = 'all',
  ) {
    const qb = this.messageRepo
      .createQueryBuilder('m')
      .select('m."connectionId"', 'connectionId')
      .addSelect('m."remotePhone"', 'remotePhone')
      .addSelect('MAX(m."remoteJid")', 'remoteJid')
      .addSelect('MAX(m."remoteName")', 'remoteName')
      .addSelect('MAX(m."createdAt")', 'lastMessageAt')
      .addSelect('COUNT(*)::int', 'messageCount')
      .addSelect(
        `SUM(CASE WHEN m.direction = 'INBOUND' AND m."readByUser" = false THEN 1 ELSE 0 END)::int`,
        'unreadCount',
      )
      .addSelect(`BOOL_OR(m."replyLater")`, 'replyLater')
      .where('m."tenantId" = :tenantId', { tenantId })
      .groupBy('m."connectionId"')
      .addGroupBy('m."remotePhone"')
      .orderBy('"lastMessageAt"', 'DESC')
      .offset((page - 1) * limit)
      .limit(limit + 1);

    if (connectionId) {
      qb.andWhere('m."connectionId" = :connectionId', { connectionId });
    }

    if (filter === 'unread') {
      qb.having(
        `SUM(CASE WHEN m.direction = 'INBOUND' AND m."readByUser" = false THEN 1 ELSE 0 END) > 0`,
      );
    } else if (filter === 'reply-later') {
      qb.having(`BOOL_OR(m."replyLater") = true`);
    }

    const chats = await qb.getRawMany();
    const hasMore = chats.length > limit;
    if (hasMore) chats.pop();

    // Build connection metadata map (for badges in "all" mode)
    const connIds = [...new Set(chats.map((c) => c.connectionId).filter(Boolean))];
    const connMeta = new Map<
      string,
      { label: string | null; phoneNumber: string | null }
    >();
    if (connIds.length) {
      const conns = await this.connectionRepo.find({
        where: connIds.map((id) => ({ id, tenantId })),
        select: ['id', 'label', 'phoneNumber'],
      });
      for (const c of conns) {
        connMeta.set(c.id, { label: c.label, phoneNumber: c.phoneNumber });
      }
    }

    // Fetch last message content + attach connection metadata for each chat
    for (const chat of chats) {
      const lastMsg = await this.messageRepo.findOne({
        where: {
          tenantId,
          connectionId: chat.connectionId,
          remotePhone: chat.remotePhone,
        },
        order: { createdAt: 'DESC' },
        select: ['content'],
      });
      chat.lastMessage = lastMsg?.content || '';
      const meta = connMeta.get(chat.connectionId);
      chat.connectionLabel = meta?.label || null;
      chat.connectionPhoneNumber = meta?.phoneNumber || null;
    }

    this.logger.log(
      `getChats tenant=${tenantId} connection=${connectionId ?? 'all'} page=${page} found=${chats.length} filter=${filter}`,
    );
    return { chats, hasMore, page };
  }

  async markChatRead(
    tenantId: string,
    connectionId: string,
    phone: string,
  ) {
    await this.assertOwnership(tenantId, connectionId);
    const clean = phone.replace(/\D/g, '');
    await this.messageRepo.update(
      {
        tenantId,
        connectionId,
        remotePhone: clean,
        direction: MessageDirection.INBOUND,
        readByUser: false,
      },
      { readByUser: true },
    );
  }

  async markChatUnread(
    tenantId: string,
    connectionId: string,
    phone: string,
  ) {
    await this.assertOwnership(tenantId, connectionId);
    const clean = phone.replace(/\D/g, '');
    const lastInbound = await this.messageRepo.findOne({
      where: {
        tenantId,
        connectionId,
        remotePhone: clean,
        direction: MessageDirection.INBOUND,
      },
      order: { createdAt: 'DESC' },
    });
    if (lastInbound) {
      await this.messageRepo.update(lastInbound.id, { readByUser: false });
    }
  }

  async toggleReplyLater(
    tenantId: string,
    connectionId: string,
    phone: string,
  ) {
    await this.assertOwnership(tenantId, connectionId);
    const clean = phone.replace(/\D/g, '');
    const latest = await this.messageRepo.findOne({
      where: { tenantId, connectionId, remotePhone: clean },
      order: { createdAt: 'DESC' },
    });
    if (!latest) return { replyLater: false };

    const newValue = !latest.replyLater;
    await this.messageRepo.update(
      { tenantId, connectionId, remotePhone: clean },
      { replyLater: newValue },
    );
    return { replyLater: newValue };
  }

  async deleteChat(
    tenantId: string,
    connectionId: string,
    phone: string,
  ) {
    await this.assertOwnership(tenantId, connectionId);
    const clean = phone.replace(/\D/g, '');
    const result = await this.messageRepo.delete({
      tenantId,
      connectionId,
      remotePhone: clean,
    });
    return { deleted: result.affected || 0 };
  }

  async getChatMessages(
    tenantId: string,
    connectionId: string,
    remotePhone: string,
    page = 1,
    limit = 50,
  ) {
    await this.assertOwnership(tenantId, connectionId);
    const clean = remotePhone.replace(/\D/g, '');

    const [messages, total] = await this.messageRepo.findAndCount({
      where: { tenantId, connectionId, remotePhone: clean },
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

  async searchMessages(
    tenantId: string,
    connectionId: string | undefined,
    query: string,
    limit = 20,
  ) {
    const escaped = query.replace(/[%_]/g, '\\$&');
    const where: any = {
      tenantId,
      content: ILike(`%${escaped}%`),
    };
    if (connectionId) where.connectionId = connectionId;

    return this.messageRepo.find({
      where,
      order: { createdAt: 'DESC' },
      take: limit,
    });
  }

  private buildDateRange(days: number, startDate?: string, endDate?: string) {
    let since: Date;
    let until: Date | undefined;

    if (startDate) {
      since = new Date(startDate);
      since.setHours(0, 0, 0, 0);
      if (endDate) {
        until = new Date(endDate);
        until.setHours(23, 59, 59, 999);
      }
    } else {
      since = new Date();
      since.setDate(since.getDate() - days);
      since.setHours(0, 0, 0, 0);
    }

    return { since, until };
  }

  async getAnalytics(
    tenantId: string,
    connectionId: string | undefined,
    days = 30,
    startDate?: string,
    endDate?: string,
  ) {
    const { since, until } = this.buildDateRange(days, startDate, endDate);

    const qb = this.messageRepo
      .createQueryBuilder('m')
      .where('m."tenantId" = :tenantId', { tenantId })
      .andWhere('m."createdAt" >= :since', { since });

    if (until) {
      qb.andWhere('m."createdAt" <= :until', { until });
    }
    if (connectionId) {
      qb.andWhere('m."connectionId" = :connectionId', { connectionId });
    }

    // KPIs
    const kpis = await qb
      .clone()
      .select(`COUNT(*)::int`, 'total')
      .addSelect(
        `SUM(CASE WHEN m.direction = 'INBOUND' THEN 1 ELSE 0 END)::int`,
        'inbound',
      )
      .addSelect(
        `SUM(CASE WHEN m.direction = 'OUTBOUND' THEN 1 ELSE 0 END)::int`,
        'outbound',
      )
      .addSelect(`COUNT(DISTINCT m."remotePhone")::int`, 'activeContacts')
      .addSelect(
        `SUM(CASE WHEN m.direction = 'INBOUND' AND m."readByUser" = false THEN 1 ELSE 0 END)::int`,
        'unread',
      )
      .getRawOne();

    // Reply-later count (distinct contacts)
    const replyLaterQb = this.messageRepo
      .createQueryBuilder('m')
      .select('COUNT(DISTINCT m."remotePhone")::int', 'count')
      .where('m."tenantId" = :tenantId', { tenantId })
      .andWhere('m."replyLater" = true');
    if (connectionId) {
      replyLaterQb.andWhere('m."connectionId" = :connectionId', {
        connectionId,
      });
    }
    const replyLaterResult = await replyLaterQb.getRawOne();

    // Volume by day
    const volumeByDay = await qb
      .clone()
      .select(`DATE(m."createdAt")`, 'date')
      .addSelect(
        `SUM(CASE WHEN m.direction = 'INBOUND' THEN 1 ELSE 0 END)::int`,
        'inbound',
      )
      .addSelect(
        `SUM(CASE WHEN m.direction = 'OUTBOUND' THEN 1 ELSE 0 END)::int`,
        'outbound',
      )
      .groupBy(`DATE(m."createdAt")`)
      .orderBy(`DATE(m."createdAt")`, 'ASC')
      .getRawMany();

    // Peak hours
    const peakHours = await qb
      .clone()
      .select(`EXTRACT(HOUR FROM m."createdAt")::int`, 'hour')
      .addSelect(`COUNT(*)::int`, 'count')
      .groupBy(`EXTRACT(HOUR FROM m."createdAt")`)
      .orderBy('hour', 'ASC')
      .getRawMany();

    // Message types
    const messageTypes = await qb
      .clone()
      .select('m.type', 'type')
      .addSelect('COUNT(*)::int', 'count')
      .groupBy('m.type')
      .orderBy('count', 'DESC')
      .getRawMany();

    // Top 10 contacts
    const topContacts = await qb
      .clone()
      .select('m."remotePhone"', 'phone')
      .addSelect('MAX(m."remoteName")', 'name')
      .addSelect('COUNT(*)::int', 'total')
      .addSelect(
        `SUM(CASE WHEN m.direction = 'INBOUND' THEN 1 ELSE 0 END)::int`,
        'inbound',
      )
      .addSelect(
        `SUM(CASE WHEN m.direction = 'OUTBOUND' THEN 1 ELSE 0 END)::int`,
        'outbound',
      )
      .groupBy('m."remotePhone"')
      .orderBy('total', 'DESC')
      .limit(10)
      .getRawMany();

    // Response rate
    const responseRateQb = qb
      .clone()
      .select(
        `COUNT(DISTINCT CASE WHEN m.direction = 'INBOUND' THEN m."remotePhone" END)::int`,
        'withInbound',
      )
      .addSelect(
        `COUNT(DISTINCT CASE WHEN m.direction = 'OUTBOUND' AND m."remotePhone" IN (
          SELECT DISTINCT m2."remotePhone" FROM whatsapp_messages m2
          WHERE m2."tenantId" = m."tenantId" AND m2.direction = 'INBOUND' AND m2."createdAt" >= :since
          ${connectionId ? 'AND m2."connectionId" = :connectionId' : ''}
        ) THEN m."remotePhone" END)::int`,
        'withResponse',
      );
    const responseRate = await responseRateQb.getRawOne();

    // Last 10 messages
    const recentWhere: any = { tenantId };
    if (connectionId) recentWhere.connectionId = connectionId;
    const recentMessages = await this.messageRepo.find({
      where: recentWhere,
      order: { createdAt: 'DESC' },
      take: 10,
      select: [
        'id',
        'connectionId',
        'remotePhone',
        'remoteName',
        'content',
        'type',
        'direction',
        'status',
        'createdAt',
      ],
    });

    return {
      kpis: {
        total: kpis?.total || 0,
        inbound: kpis?.inbound || 0,
        outbound: kpis?.outbound || 0,
        activeContacts: kpis?.activeContacts || 0,
        unread: kpis?.unread || 0,
        replyLater: replyLaterResult?.count || 0,
        responseRate:
          kpis?.total > 0 && responseRate?.withInbound > 0
            ? Math.round(
                (responseRate.withResponse / responseRate.withInbound) * 100,
              )
            : 0,
      },
      volumeByDay,
      peakHours,
      messageTypes,
      topContacts,
      recentMessages,
    };
  }

  async exportAnalyticsToExcel(
    tenantId: string,
    connectionId: string | undefined,
    days = 30,
    startDate?: string,
    endDate?: string,
  ): Promise<Buffer> {
    const { since, until } = this.buildDateRange(days, startDate, endDate);

    const qb = this.messageRepo
      .createQueryBuilder('m')
      .where('m."tenantId" = :tenantId', { tenantId })
      .andWhere('m."createdAt" >= :since', { since });

    if (until) {
      qb.andWhere('m."createdAt" <= :until', { until });
    }
    if (connectionId) {
      qb.andWhere('m."connectionId" = :connectionId', { connectionId });
    }

    const messages = await qb
      .clone()
      .select([
        'm.remoteName',
        'm.remotePhone',
        'm.content',
        'm.type',
        'm.direction',
        'm.status',
        'm.createdAt',
      ])
      .orderBy('m."createdAt"', 'DESC')
      .getMany();

    const wb = new ExcelJS.Workbook();

    const wsMsgs = wb.addWorksheet('Mensagens');
    const msgHeaders = [
      'Contato',
      'Telefone',
      'Mensagem',
      'Tipo',
      'Direcao',
      'Status',
      'Data/Hora',
    ];
    const msgWidths = [25, 18, 50, 12, 12, 12, 20];
    wsMsgs.columns = msgHeaders.map((header, i) => ({
      header,
      width: msgWidths[i],
    }));

    const directionLabel = { INBOUND: 'Recebida', OUTBOUND: 'Enviada' };
    const typeLabels: Record<string, string> = {
      text: 'Texto',
      image: 'Imagem',
      audio: 'Audio',
      video: 'Video',
      document: 'Documento',
      sticker: 'Sticker',
      location: 'Localizacao',
      contact: 'Contato',
    };

    for (const msg of messages) {
      wsMsgs.addRow([
        msg.remoteName || '',
        msg.remotePhone,
        msg.content || `[${msg.type}]`,
        typeLabels[msg.type] || msg.type,
        directionLabel[msg.direction] || msg.direction,
        msg.status,
        msg.createdAt,
      ]);
    }

    const contactStats = await qb
      .clone()
      .select('m."remotePhone"', 'phone')
      .addSelect('MAX(m."remoteName")', 'name')
      .addSelect('COUNT(*)::int', 'total')
      .addSelect(
        `SUM(CASE WHEN m.direction = 'INBOUND' THEN 1 ELSE 0 END)::int`,
        'inbound',
      )
      .addSelect(
        `SUM(CASE WHEN m.direction = 'OUTBOUND' THEN 1 ELSE 0 END)::int`,
        'outbound',
      )
      .groupBy('m."remotePhone"')
      .orderBy('total', 'DESC')
      .getRawMany();

    const wsContacts = wb.addWorksheet('Contatos');
    const contactHeaders = ['Contato', 'Telefone', 'Total', 'Recebidas', 'Enviadas'];
    const contactWidths = [25, 18, 10, 12, 12];
    wsContacts.columns = contactHeaders.map((header, i) => ({
      header,
      width: contactWidths[i],
    }));

    for (const c of contactStats) {
      wsContacts.addRow([c.name || '', c.phone, c.total, c.inbound, c.outbound]);
    }

    const volumeByDay = await qb
      .clone()
      .select(`DATE(m."createdAt")`, 'date')
      .addSelect(
        `SUM(CASE WHEN m.direction = 'INBOUND' THEN 1 ELSE 0 END)::int`,
        'inbound',
      )
      .addSelect(
        `SUM(CASE WHEN m.direction = 'OUTBOUND' THEN 1 ELSE 0 END)::int`,
        'outbound',
      )
      .groupBy(`DATE(m."createdAt")`)
      .orderBy(`DATE(m."createdAt")`, 'ASC')
      .getRawMany();

    const wsVolume = wb.addWorksheet('Volume por Dia');
    wsVolume.columns = [
      { header: 'Data', width: 14 },
      { header: 'Recebidas', width: 12 },
      { header: 'Enviadas', width: 12 },
    ];

    for (const v of volumeByDay) {
      wsVolume.addRow([v.date, v.inbound, v.outbound]);
    }

    for (const ws of [wsMsgs, wsContacts, wsVolume]) {
      const headerRow = ws.getRow(1);
      headerRow.eachCell((cell) => {
        cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FF4A4A4A' },
        };
        cell.alignment = { horizontal: 'center' };
      });
    }

    const arrayBuffer = await wb.xlsx.writeBuffer();
    return Buffer.from(arrayBuffer);
  }

  // ── Backfill: mark singleton connections as default ──

  async backfillDefaultConnections() {
    const raw = await this.connectionRepo
      .createQueryBuilder('c')
      .select('c."tenantId"', 'tenantId')
      .addSelect('COUNT(*)::int', 'count')
      .addSelect(
        `SUM(CASE WHEN c."isDefault" = true THEN 1 ELSE 0 END)::int`,
        'defaults',
      )
      .groupBy('c."tenantId"')
      .getRawMany();

    let promoted = 0;
    for (const row of raw) {
      if (row.count === 1 && row.defaults === 0) {
        const conn = await this.connectionRepo.findOne({
          where: { tenantId: row.tenantId },
        });
        if (conn) {
          await this.connectionRepo.update(conn.id, { isDefault: true });
          promoted++;
        }
      }
    }

    if (promoted > 0) {
      this.logger.log(`Backfill: promoted ${promoted} connections to default`);
    }
  }
}
