import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Not, In } from 'typeorm';
import { User } from '../../core/users/user.entity';
import {
  ChatConversation,
  ConversationType,
} from './entities/conversation.entity';
import { ChatMessage, MessageType } from './entities/message.entity';
import {
  ChatParticipant,
  ParticipantRole,
} from './entities/participant.entity';
import {
  CreateDirectConversationDto,
  CreateGroupConversationDto,
} from './dto/create-conversation.dto';
import { SendMessageDto } from './dto/send-message.dto';
import { UpdateConversationDto } from './dto/update-conversation.dto';

@Injectable()
export class ChatService {
  constructor(
    @InjectRepository(ChatConversation)
    private conversationRepo: Repository<ChatConversation>,
    @InjectRepository(ChatMessage)
    private messageRepo: Repository<ChatMessage>,
    @InjectRepository(ChatParticipant)
    private participantRepo: Repository<ChatParticipant>,
    @InjectRepository(User)
    private userRepo: Repository<User>,
  ) {}

  async getTenantUsers(tenantId: string, currentUserId: string) {
    const users = await this.userRepo.find({
      where: { tenantId, active: true, id: Not(currentUserId) },
      select: ['id', 'name', 'email', 'avatarUrl'],
      order: { name: 'ASC' },
    });
    return users;
  }

  async getConversations(tenantId: string, userId: string) {
    const participantConvos = await this.participantRepo.find({
      where: { userId },
      select: ['conversationId'],
    });

    const conversationIds = participantConvos.map((p) => p.conversationId);
    if (conversationIds.length === 0) return [];

    const conversations = await this.conversationRepo
      .createQueryBuilder('c')
      .leftJoinAndSelect('c.participants', 'p')
      .where('c.id IN (:...ids)', { ids: conversationIds })
      .andWhere('c.tenantId = :tenantId', { tenantId })
      .orderBy('c.lastMessageAt', 'DESC', 'NULLS LAST')
      .addOrderBy('c.createdAt', 'DESC')
      .getMany();

    // Auto-fix: fill missing participant names
    const missingNameParticipants = conversations
      .flatMap((c) => c.participants)
      .filter((p) => !p.userName);

    if (missingNameParticipants.length > 0) {
      const missingIds = [...new Set(missingNameParticipants.map((p) => p.userId))];
      const users = await this.userRepo.find({ where: { id: In(missingIds) }, select: ['id', 'name'] });
      const nameMap = new Map(users.map((u) => [u.id, u.name]));

      const updates = missingNameParticipants
        .filter((p) => nameMap.has(p.userId))
        .map((p) => {
          p.userName = nameMap.get(p.userId)!;
          return this.participantRepo.update(p.id, { userName: p.userName });
        });
      await Promise.all(updates);
    }

    return conversations.map((conv) => {
      const myParticipant = conv.participants.find((p) => p.userId === userId);
      return {
        ...conv,
        unreadCount: myParticipant?.unreadCount ?? 0,
        muted: myParticipant?.muted ?? false,
      };
    });
  }

  async getConversation(tenantId: string, conversationId: string, userId: string) {
    const conversation = await this.conversationRepo.findOne({
      where: { id: conversationId, tenantId },
      relations: ['participants'],
    });

    if (!conversation) throw new NotFoundException('Conversa não encontrada');
    this.assertParticipant(conversation, userId);

    return conversation;
  }

  async createDirect(
    tenantId: string,
    userId: string,
    userName: string,
    dto: CreateDirectConversationDto,
  ) {
    if (dto.participantId === userId) {
      throw new BadRequestException('Não é possível criar conversa consigo mesmo');
    }

    const existing = await this.findExistingDirect(tenantId, userId, dto.participantId);
    if (existing) {
      // Fix missing participant names on existing conversations
      const missingNames = existing.participants.filter((p) => !p.userName);
      if (missingNames.length > 0) {
        const ids = missingNames.map((p) => p.userId);
        const users = await this.userRepo.find({ where: { id: In(ids) }, select: ['id', 'name'] });
        const nameMap = new Map(users.map((u) => [u.id, u.name]));
        for (const p of missingNames) {
          if (nameMap.has(p.userId)) {
            p.userName = nameMap.get(p.userId)!;
            await this.participantRepo.update(p.id, { userName: p.userName });
          }
        }
      }
      return existing;
    }

    const otherUser = await this.userRepo.findOne({
      where: { id: dto.participantId },
      select: ['id', 'name'],
    });

    const conversation = this.conversationRepo.create({
      tenantId,
      type: ConversationType.DIRECT,
    });
    const saved = await this.conversationRepo.save(conversation);

    await this.participantRepo.save([
      this.participantRepo.create({
        conversationId: saved.id,
        userId,
        userName,
        role: ParticipantRole.MEMBER,
      }),
      this.participantRepo.create({
        conversationId: saved.id,
        userId: dto.participantId,
        userName: otherUser?.name ?? undefined,
        role: ParticipantRole.MEMBER,
      }),
    ]);

    return this.conversationRepo.findOne({
      where: { id: saved.id },
      relations: ['participants'],
    });
  }

  async createGroup(
    tenantId: string,
    userId: string,
    userName: string,
    dto: CreateGroupConversationDto,
  ) {
    const conversation = this.conversationRepo.create({
      tenantId,
      name: dto.name,
      avatarUrl: dto.avatarUrl,
      type: ConversationType.GROUP,
    });
    const saved = await this.conversationRepo.save(conversation);

    const allUserIds = [...new Set([userId, ...dto.participantIds])];
    const otherIds = allUserIds.filter((uid) => uid !== userId);

    const otherUsers = otherIds.length > 0
      ? await this.userRepo.find({ where: { id: In(otherIds) }, select: ['id', 'name'] })
      : [];
    const nameMap = new Map(otherUsers.map((u) => [u.id, u.name]));

    const participants = allUserIds.map((uid) =>
      this.participantRepo.create({
        conversationId: saved.id,
        userId: uid,
        userName: uid === userId ? userName : nameMap.get(uid) ?? undefined,
        role: uid === userId ? ParticipantRole.ADMIN : ParticipantRole.MEMBER,
      }),
    );

    await this.participantRepo.save(participants);

    return this.conversationRepo.findOne({
      where: { id: saved.id },
      relations: ['participants'],
    });
  }

  async updateConversation(
    tenantId: string,
    conversationId: string,
    userId: string,
    dto: UpdateConversationDto,
  ) {
    const conversation = await this.getConversation(tenantId, conversationId, userId);

    if (conversation.type === ConversationType.DIRECT) {
      throw new BadRequestException('Não é possível editar conversa direta');
    }

    Object.assign(conversation, dto);
    return this.conversationRepo.save(conversation);
  }

  async deleteConversation(tenantId: string, conversationId: string, userId: string) {
    const conversation = await this.getConversation(tenantId, conversationId, userId);

    if (conversation.type === ConversationType.GROUP) {
      const participant = conversation.participants.find((p) => p.userId === userId);
      if (participant?.role !== ParticipantRole.ADMIN) {
        throw new ForbiddenException('Apenas admins podem excluir o grupo');
      }
    }

    return this.conversationRepo.remove(conversation);
  }

  async getMessages(
    tenantId: string,
    conversationId: string,
    userId: string,
    page = 1,
    limit = 50,
  ) {
    await this.getConversation(tenantId, conversationId, userId);

    const [messages, total] = await this.messageRepo.findAndCount({
      where: { conversationId },
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    return { messages: messages.reverse(), total, page, limit };
  }

  async sendMessage(
    tenantId: string,
    conversationId: string,
    userId: string,
    userName: string,
    dto: SendMessageDto,
  ) {
    const conversation = await this.getConversation(tenantId, conversationId, userId);

    const message = this.messageRepo.create({
      conversationId,
      senderId: userId,
      senderName: userName,
      content: dto.content,
      type: dto.type || MessageType.TEXT,
      attachmentUrl: dto.attachmentUrl,
      attachmentName: dto.attachmentName,
      readBy: [userId],
    });

    const saved = await this.messageRepo.save(message);

    conversation.lastMessageText = dto.content;
    conversation.lastMessageAt = new Date();
    await this.conversationRepo.save(conversation);

    await this.participantRepo
      .createQueryBuilder()
      .update(ChatParticipant)
      .set({ unreadCount: () => '"unreadCount" + 1' })
      .where('conversationId = :conversationId', { conversationId })
      .andWhere('userId != :userId', { userId })
      .execute();

    return saved;
  }

  async markAsRead(tenantId: string, conversationId: string, userId: string) {
    await this.getConversation(tenantId, conversationId, userId);

    await this.participantRepo.update(
      { conversationId, userId },
      { unreadCount: 0, lastReadAt: new Date() },
    );

    await this.messageRepo
      .createQueryBuilder()
      .update(ChatMessage)
      .set({ readBy: () => `"readBy" || '"${userId}"'::jsonb` })
      .where('conversationId = :conversationId', { conversationId })
      .andWhere('NOT ("readBy" @> :userId::jsonb)', {
        userId: JSON.stringify([userId]),
      })
      .execute();

    return { success: true };
  }

  async addParticipant(
    tenantId: string,
    conversationId: string,
    userId: string,
    targetUserId: string,
  ) {
    const conversation = await this.getConversation(tenantId, conversationId, userId);

    if (conversation.type !== ConversationType.GROUP) {
      throw new BadRequestException('Só é possível adicionar membros em grupos');
    }

    const existing = await this.participantRepo.findOne({
      where: { conversationId, userId: targetUserId },
    });
    if (existing) throw new BadRequestException('Usuário já está na conversa');

    const targetUser = await this.userRepo.findOne({
      where: { id: targetUserId },
      select: ['id', 'name'],
    });

    const participant = this.participantRepo.create({
      conversationId,
      userId: targetUserId,
      userName: targetUser?.name ?? undefined,
      role: ParticipantRole.MEMBER,
    });

    return this.participantRepo.save(participant);
  }

  async removeParticipant(
    tenantId: string,
    conversationId: string,
    userId: string,
    targetUserId: string,
  ) {
    const conversation = await this.getConversation(tenantId, conversationId, userId);

    if (conversation.type !== ConversationType.GROUP) {
      throw new BadRequestException('Só é possível remover membros de grupos');
    }

    if (userId !== targetUserId) {
      const myRole = conversation.participants.find((p) => p.userId === userId);
      if (myRole?.role !== ParticipantRole.ADMIN) {
        throw new ForbiddenException('Apenas admins podem remover membros');
      }
    }

    const participant = await this.participantRepo.findOne({
      where: { conversationId, userId: targetUserId },
    });
    if (!participant) throw new NotFoundException('Participante não encontrado');

    return this.participantRepo.remove(participant);
  }

  async toggleMute(tenantId: string, conversationId: string, userId: string) {
    await this.getConversation(tenantId, conversationId, userId);

    const participant = await this.participantRepo.findOne({
      where: { conversationId, userId },
    });

    if (!participant) throw new NotFoundException('Participante não encontrado');
    participant.muted = !participant.muted;
    return this.participantRepo.save(participant);
  }

  async getParticipantUserIds(conversationId: string): Promise<string[]> {
    const participants = await this.participantRepo.find({
      where: { conversationId },
      select: ['userId'],
    });
    return participants.map((p) => p.userId);
  }

  private async findExistingDirect(
    tenantId: string,
    userId1: string,
    userId2: string,
  ) {
    const result = await this.conversationRepo
      .createQueryBuilder('c')
      .innerJoin('c.participants', 'p1', 'p1.userId = :userId1', { userId1 })
      .innerJoin('c.participants', 'p2', 'p2.userId = :userId2', { userId2 })
      .leftJoinAndSelect('c.participants', 'participants')
      .where('c.tenantId = :tenantId', { tenantId })
      .andWhere('c.type = :type', { type: ConversationType.DIRECT })
      .getOne();

    return result;
  }

  private assertParticipant(conversation: ChatConversation, userId: string) {
    const isParticipant = conversation.participants.some(
      (p) => p.userId === userId,
    );
    if (!isParticipant) {
      throw new ForbiddenException('Você não participa desta conversa');
    }
  }
}
