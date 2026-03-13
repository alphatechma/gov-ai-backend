import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { ChatService } from '../chat.service';

interface AuthenticatedSocket extends Socket {
  userId: string;
  tenantId: string;
  userName: string;
}

@WebSocketGateway({
  cors: { origin: '*' },
  namespace: '/chat',
})
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private onlineUsers = new Map<string, Set<string>>(); // userId -> Set<socketId>

  constructor(
    private jwtService: JwtService,
    private configService: ConfigService,
    private chatService: ChatService,
  ) {}

  async handleConnection(client: AuthenticatedSocket) {
    try {
      const token =
        client.handshake.auth?.token ||
        client.handshake.headers?.authorization?.replace('Bearer ', '');

      if (!token) {
        client.disconnect();
        return;
      }

      const payload = this.jwtService.verify(token, {
        secret: this.configService.get('JWT_SECRET'),
      });

      client.userId = payload.sub;
      client.tenantId = payload.tenantId;
      client.userName = payload.name;

      // Track online status
      if (!this.onlineUsers.has(client.userId)) {
        this.onlineUsers.set(client.userId, new Set());
      }
      this.onlineUsers.get(client.userId)!.add(client.id);

      // Join tenant room
      client.join(`tenant:${client.tenantId}`);

      // Join user's personal room (for targeted messages)
      client.join(`user:${client.userId}`);

      // Broadcast online status to tenant
      this.server
        .to(`tenant:${client.tenantId}`)
        .emit('user:online', { userId: client.userId });
    } catch {
      client.disconnect();
    }
  }

  handleDisconnect(client: AuthenticatedSocket) {
    if (!client.userId) return;

    const sockets = this.onlineUsers.get(client.userId);
    if (sockets) {
      sockets.delete(client.id);
      if (sockets.size === 0) {
        this.onlineUsers.delete(client.userId);
        // User fully offline
        this.server
          .to(`tenant:${client.tenantId}`)
          .emit('user:offline', { userId: client.userId });
      }
    }
  }

  @SubscribeMessage('conversation:join')
  async handleJoinConversation(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { conversationId: string },
  ) {
    client.join(`conversation:${data.conversationId}`);
  }

  @SubscribeMessage('conversation:leave')
  async handleLeaveConversation(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { conversationId: string },
  ) {
    client.leave(`conversation:${data.conversationId}`);
  }

  @SubscribeMessage('message:send')
  async handleSendMessage(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody()
    data: {
      conversationId: string;
      content: string;
      type?: string;
      attachmentUrl?: string;
      attachmentName?: string;
    },
  ) {
    const message = await this.chatService.sendMessage(
      client.tenantId,
      data.conversationId,
      client.userId,
      client.userName,
      {
        content: data.content,
        type: data.type as any,
        attachmentUrl: data.attachmentUrl,
        attachmentName: data.attachmentName,
      },
    );

    // Emit to all participants in the conversation room
    this.server
      .to(`conversation:${data.conversationId}`)
      .emit('message:new', message);

    // Also notify participants not in the room via their personal rooms
    const participantIds = await this.chatService.getParticipantUserIds(
      data.conversationId,
    );
    for (const uid of participantIds) {
      if (uid !== client.userId) {
        this.server.to(`user:${uid}`).emit('conversation:updated', {
          conversationId: data.conversationId,
          lastMessageText: data.content,
          lastMessageAt: message.createdAt,
        });
      }
    }

    return message;
  }

  @SubscribeMessage('message:read')
  async handleMarkRead(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { conversationId: string },
  ) {
    await this.chatService.markAsRead(
      client.tenantId,
      data.conversationId,
      client.userId,
    );

    this.server.to(`conversation:${data.conversationId}`).emit('message:read', {
      conversationId: data.conversationId,
      userId: client.userId,
    });
  }

  @SubscribeMessage('typing:start')
  handleTypingStart(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { conversationId: string },
  ) {
    client.to(`conversation:${data.conversationId}`).emit('typing:start', {
      conversationId: data.conversationId,
      userId: client.userId,
      userName: client.userName,
    });
  }

  @SubscribeMessage('typing:stop')
  handleTypingStop(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { conversationId: string },
  ) {
    client.to(`conversation:${data.conversationId}`).emit('typing:stop', {
      conversationId: data.conversationId,
      userId: client.userId,
    });
  }

  @SubscribeMessage('online:check')
  handleOnlineCheck(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { userIds: string[] },
  ) {
    const onlineStatus = data.userIds.map((uid) => ({
      userId: uid,
      online: this.onlineUsers.has(uid),
    }));
    return onlineStatus;
  }
}
