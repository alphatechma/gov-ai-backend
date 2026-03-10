import { Module, OnModuleInit } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { WhatsappConnection } from './entities/whatsapp-connection.entity';
import { WhatsappMessage } from './entities/whatsapp-message.entity';
import { TenantModule as TenantModuleEntity } from '../../core/modules/tenant-module.entity';
import { WhatsappBaileysService } from './whatsapp-baileys.service';
import { WhatsappService } from './whatsapp.service';
import { WhatsappController } from './whatsapp.controller';
import { WhatsappGateway } from './whatsapp.gateway';

@Module({
  imports: [
    TypeOrmModule.forFeature([WhatsappConnection, WhatsappMessage, TenantModuleEntity]),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get('JWT_SECRET'),
      }),
    }),
  ],
  controllers: [WhatsappController],
  providers: [WhatsappBaileysService, WhatsappService, WhatsappGateway],
  exports: [WhatsappService],
})
export class WhatsappModule implements OnModuleInit {
  constructor(private baileys: WhatsappBaileysService) {}

  async onModuleInit() {
    // Restore active connections on startup
    await this.baileys.restoreConnections();
  }
}
