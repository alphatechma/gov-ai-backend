import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { WhatsappEvolutionService } from './whatsapp-evolution.service';

interface AuthenticatedSocket extends Socket {
  userId: string;
  tenantId: string;
}

@WebSocketGateway({
  cors: { origin: '*' },
  namespace: '/whatsapp',
})
export class WhatsappGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  constructor(
    private jwtService: JwtService,
    private configService: ConfigService,
    private evolution: WhatsappEvolutionService,
  ) {
    // Forward evolution events to WebSocket clients, always including connectionId
    this.evolution.on('qr', ({ tenantId, connectionId, qrCode }) => {
      this.server
        ?.to(`tenant:${tenantId}`)
        .emit('whatsapp:qr', { connectionId, qrCode });
    });

    this.evolution.on(
      'connected',
      ({ tenantId, connectionId, phoneNumber, pushName }) => {
        this.server
          ?.to(`tenant:${tenantId}`)
          .emit('whatsapp:connected', { connectionId, phoneNumber, pushName });
      },
    );

    this.evolution.on(
      'disconnected',
      ({ tenantId, connectionId, loggedOut }) => {
        this.server
          ?.to(`tenant:${tenantId}`)
          .emit('whatsapp:disconnected', { connectionId, loggedOut });
      },
    );

    this.evolution.on('message', ({ tenantId, connectionId, message }) => {
      this.server
        ?.to(`tenant:${tenantId}`)
        .emit('whatsapp:message', { connectionId, message });
    });

    this.evolution.on(
      'message:status',
      ({ tenantId, connectionId, externalId, status }) => {
        this.server
          ?.to(`tenant:${tenantId}`)
          .emit('whatsapp:message:status', {
            connectionId,
            externalId,
            status,
          });
      },
    );
  }

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
      client.join(`tenant:${payload.tenantId}`);
    } catch {
      client.disconnect();
    }
  }

  handleDisconnect(_client: AuthenticatedSocket) {
    // No cleanup needed
  }
}
