import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { LeadsModule } from '../leads/leads.module';
import { PlansModule } from '../plans/plans.module';
import { TenantsModule } from '../tenants/tenants.module';
import { UsersModule } from '../users/users.module';
import { Lead } from '../leads/lead.entity';
import { Plan } from '../plans/plan.entity';
import { Subscriber } from '../subscribers/subscriber.entity';
import { Tenant } from '../tenants/tenant.entity';
import { User } from '../users/user.entity';
import { MailModule } from '../../shared/mail/mail.module';
import { CheckoutSession } from './entities/checkout-session.entity';
import { SignupToken } from './entities/signup-token.entity';
import { SubscriptionPayment } from './entities/subscription-payment.entity';
import { CheckoutController } from './checkout.controller';
import { CheckoutService } from './checkout.service';
import { CheckoutWebhookService } from './services/checkout-webhook.service';
import { CheckoutSignupService } from './services/checkout-signup.service';
import { MercadoPagoService } from './services/mercado-pago.service';
import { SignupTokenService } from './services/signup-token.service';
import { AdminPaymentLinksService } from './services/admin-payment-links.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      CheckoutSession,
      SignupToken,
      SubscriptionPayment,
      Lead,
      Plan,
      Subscriber,
      Tenant,
      User,
    ]),
    AuthModule,
    LeadsModule,
    PlansModule,
    TenantsModule,
    UsersModule,
    MailModule,
  ],
  controllers: [CheckoutController],
  providers: [
    CheckoutService,
    CheckoutWebhookService,
    CheckoutSignupService,
    MercadoPagoService,
    SignupTokenService,
    AdminPaymentLinksService,
  ],
  exports: [MercadoPagoService],
})
export class CheckoutModule {}
