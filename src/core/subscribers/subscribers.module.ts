import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SubscribersService } from './subscribers.service';
import { SubscribersController } from './subscribers.controller';
import { SubscriptionExpirationService } from './subscription-expiration.service';
import { Subscriber } from './subscriber.entity';
import { Lead } from '../leads/lead.entity';
import { Plan } from '../plans/plan.entity';
import { User } from '../users/user.entity';
import { CheckoutSession } from '../checkout/entities/checkout-session.entity';
import { SubscriptionPayment } from '../checkout/entities/subscription-payment.entity';
import { CheckoutModule } from '../checkout/checkout.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Subscriber,
      Lead,
      Plan,
      User,
      CheckoutSession,
      SubscriptionPayment,
    ]),
    CheckoutModule,
  ],
  controllers: [SubscribersController],
  providers: [SubscribersService, SubscriptionExpirationService],
  exports: [SubscribersService],
})
export class SubscribersModule {}
