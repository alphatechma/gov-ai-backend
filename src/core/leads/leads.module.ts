import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LeadsService } from './leads.service';
import { LeadsController } from './leads.controller';
import { LeadsBotController } from './leads-bot.controller';
import { Lead } from './lead.entity';
import { Subscriber } from '../subscribers/subscriber.entity';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [TypeOrmModule.forFeature([Lead, Subscriber]), AuthModule],
  controllers: [LeadsBotController, LeadsController],
  providers: [LeadsService],
  exports: [LeadsService],
})
export class LeadsModule {}
