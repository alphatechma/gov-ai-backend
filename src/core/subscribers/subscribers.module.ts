import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SubscribersService } from './subscribers.service';
import { SubscribersController } from './subscribers.controller';
import { Subscriber } from './subscriber.entity';
import { Lead } from '../leads/lead.entity';
import { Plan } from '../plans/plan.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Subscriber, Lead, Plan])],
  controllers: [SubscribersController],
  providers: [SubscribersService],
  exports: [SubscribersService],
})
export class SubscribersModule {}
