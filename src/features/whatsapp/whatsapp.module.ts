import { Module, OnModuleInit } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { WhatsappConnection } from './entities/whatsapp-connection.entity';
import { WhatsappMessage } from './entities/whatsapp-message.entity';
import { TenantModule as TenantModuleEntity } from '../../core/modules/tenant-module.entity';
import { WhatsappEvolutionService } from './whatsapp-evolution.service';
import { WhatsappService } from './whatsapp.service';
import { WhatsappController } from './whatsapp.controller';
import { WhatsappGateway } from './whatsapp.gateway';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      WhatsappConnection,
      WhatsappMessage,
      TenantModuleEntity,
    ]),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get('JWT_SECRET'),
      }),
    }),
    ConfigModule,
  ],
  controllers: [WhatsappController],
  providers: [WhatsappEvolutionService, WhatsappService, WhatsappGateway],
  exports: [WhatsappService],
})
export class WhatsappModule implements OnModuleInit {
  constructor(private evolution: WhatsappEvolutionService) {}

  async onModuleInit() {
    await this.evolution.restoreConnections();
  }
}
