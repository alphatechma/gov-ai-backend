import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LeadsService } from './leads.service';
import { LeadsController } from './leads.controller';
import { LeadsBotController } from './leads-bot.controller';
import { Lead } from './lead.entity';
import { Subscriber } from '../subscribers/subscriber.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Lead, Subscriber])],
  controllers: [LeadsController, LeadsBotController],
  providers: [LeadsService],
  exports: [LeadsService],
})
export class LeadsModule {}
