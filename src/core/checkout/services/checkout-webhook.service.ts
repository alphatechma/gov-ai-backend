import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BillingCycle, CheckoutStatus, MpResourceType } from '../../../shared/enums';
import { CheckoutSession } from '../entities/checkout-session.entity';
import { SubscriptionPayment } from '../entities/subscription-payment.entity';
import { SignupToken } from '../entities/signup-token.entity';
import { Lead } from '../../leads/lead.entity';
import { Plan } from '../../plans/plan.entity';
import { Subscriber } from '../../subscribers/subscriber.entity';
import { User } from '../../users/user.entity';
import { MercadoPagoService, MpPaymentLookup } from './mercado-pago.service';
import { SignupTokenService } from './signup-token.service';
import { MailService } from '../../../shared/mail/mail.service';
import { buildSignupInvitationHtml } from '../../../shared/mail/templates/signup-invitation.template';
import { MpWebhookBody, MpWebhookQuery } from '../dto/mp-webhook.dto';

const PUT_ADJUST_RETRIES_MS = [0, 500, 2000];

type WebhookResource =
  | 'payment'
  | 'preapproval'
  | 'authorized_payment'
  | 'merchant_order'
  | 'unknown';

@Injectable()
export class CheckoutWebhookService {
  private readonly logger = new Logger(CheckoutWebhookService.name);

  constructor(
    @InjectRepository(CheckoutSession)
    private sessionsRepo: Repository<CheckoutSession>,
    @InjectRepository(SubscriptionPayment)
    private paymentsRepo: Repository<SubscriptionPayment>,
    @InjectRepository(SignupToken)
    private tokensRepo: Repository<SignupToken>,
    @InjectRepository(Lead)
    private leadsRepo: Repository<Lead>,
    @InjectRepository(Plan)
    private plansRepo: Repository<Plan>,
    @InjectRepository(Subscriber)
    private subscribersRepo: Repository<Subscriber>,
    @InjectRepository(User)
    private usersRepo: Repository<User>,
    private mercadoPago: MercadoPagoService,
    private signupTokenService: SignupTokenService,
    private mailService: MailService,
    private configService: ConfigService,
  ) {}

  async handle(
    body: MpWebhookBody,
    query: MpWebhookQuery,
    _headers: Record<string, string | string[]>,
  ): Promise<void> {
    const resource = this.resolveResource(body, query);
    const resourceId = this.resolveResourceId(body, query);

    this.logger.log(
      `Webhook MP recebido: resource=${resource}, id=${resourceId ?? '<none>'}, type=${body.type ?? query.type ?? ''}, action=${body.action ?? ''}`,
    );

    if (!resourceId) return;

    try {
      if (resource === 'payment') {
        await this.handlePaymentNotification(resourceId);
      } else if (resource === 'preapproval') {
        await this.handlePreapprovalNotification(resourceId);
      } else if (resource === 'authorized_payment') {
        await this.handleAuthorizedPaymentNotification(resourceId);
      } else if (resource === 'merchant_order') {
        await this.handleMerchantOrderNotification(resourceId);
      } else {
        this.logger.warn(
          `Webhook com resource desconhecido ignorado (id=${resourceId})`,
        );
      }
    } catch (err) {
      this.logger.error(
        `Falha processando webhook (resource=${resource}, id=${resourceId}): ${(err as Error).message}`,
        (err as Error).stack,
      );
    }
  }

  async describeSignupToken(plaintext: string) {
    const result = await this.signupTokenService.validate(plaintext);
    if (!result.valid) {
      if (result.reason === 'not_found') {
        throw new NotFoundException('Token não encontrado');
      }
      return {
        valid: false as const,
        expired: result.reason === 'expired',
        used: result.reason === 'used',
      };
    }

    const session = await this.sessionsRepo.findOne({
      where: { id: result.token.checkoutSessionId },
    });
    if (!session) throw new NotFoundException('Sessão de checkout não encontrada');

    const [lead, plan] = await Promise.all([
      this.leadsRepo.findOne({ where: { id: session.leadId } }),
      this.plansRepo.findOne({ where: { id: session.planId } }),
    ]);

    return {
      valid: true as const,
      lead: lead
        ? { name: lead.name, email: lead.email, phone: lead.phone }
        : null,
      plan: plan
        ? { id: plan.id, name: plan.name, billingCycle: plan.billingCycle }
        : null,
    };
  }

  private resolveResource(
    body: MpWebhookBody,
    query: MpWebhookQuery,
  ): WebhookResource {
    const raw = (body.type ?? body.topic ?? query.type ?? query.topic ?? '')
      .toString()
      .toLowerCase();
    if (raw === 'payment') return 'payment';
    if (raw === 'preapproval') return 'preapproval';
    if (raw === 'subscription_authorized_payment' || raw === 'authorized_payment')
      return 'authorized_payment';
    if (raw === 'subscription_preapproval') return 'preapproval';
    if (
      raw === 'merchant_order' ||
      raw === 'topic_merchant_order_wh' ||
      raw === 'merchant_orders'
    )
      return 'merchant_order';
    return 'unknown';
  }

  private resolveResourceId(
    body: MpWebhookBody,
    query: MpWebhookQuery,
  ): string | null {
    const fromBody = body.data?.id ?? body.id;
    if (fromBody !== undefined && fromBody !== null) return String(fromBody);
    const fromQuery = query['data.id'] ?? query.id;
    if (fromQuery !== undefined && fromQuery !== null)
      return String(fromQuery);
    return null;
  }

  private async handleMerchantOrderNotification(
    merchantOrderId: string,
  ): Promise<void> {
    const order = await this.mercadoPago.getMerchantOrder(merchantOrderId);
    if (!order.payments.length) {
      this.logger.log(
        `merchant_order ${merchantOrderId} sem pagamentos — aguardando próximo webhook`,
      );
      return;
    }

    const approved = order.payments.find((p) => p.status === 'approved');
    const target = approved ?? order.payments[order.payments.length - 1];
    this.logger.log(
      `merchant_order ${merchantOrderId} delegando payment ${target.id} (status=${target.status ?? 'desconhecido'})`,
    );
    await this.handlePaymentNotification(target.id);
  }

  private async handlePaymentNotification(paymentId: string): Promise<void> {
    const payment = await this.mercadoPago.getPayment(paymentId);
    const externalReference = payment.external_reference;
    if (!externalReference) {
      this.logger.warn(
        `Payment ${paymentId} sem external_reference — ignorando`,
      );
      return;
    }
    const session = await this.sessionsRepo.findOne({
      where: { id: externalReference },
    });
    if (!session) {
      this.logger.warn(
        `Payment ${paymentId} referencia session ${externalReference} inexistente`,
      );
      return;
    }

    if (session.mpResourceType !== MpResourceType.PREFERENCE) {
      this.logger.log(
        `Payment ${paymentId} para session ${session.id} (não-PREFERENCE) — ignorando`,
      );
      return;
    }

    const status = payment.status ?? '';
    if (status === 'approved') {
      await this.markPreferencePaid(session, payment, status);
    } else if (status === 'rejected' || status === 'cancelled') {
      await this.markPreferenceFailed(session, payment.id, status);
    } else {
      session.mpStatus = status;
      await this.sessionsRepo.save(session);
    }
  }

  private async markPreferencePaid(
    session: CheckoutSession,
    payment: MpPaymentLookup,
    status: string,
  ): Promise<void> {
    const result = await this.sessionsRepo
      .createQueryBuilder()
      .update(CheckoutSession)
      .set({
        status: CheckoutStatus.PAID,
        mpStatus: status,
        mpPaymentId: payment.id,
        paidAt: new Date(),
      })
      .where('id = :id AND status = :pending', {
        id: session.id,
        pending: CheckoutStatus.PENDING,
      })
      .execute();

    const amount =
      payment.transaction_amount ?? session.firstChargeAmount;
    await this.recordSubscriptionPayment(
      session.id,
      payment.id,
      Number(amount),
      status,
      payment.raw,
    );

    if (!result.affected) {
      this.logger.log(
        `Session ${session.id} já processada (PREFERENCE) — não reenviando email`,
      );
      return;
    }

    const fresh = await this.sessionsRepo.findOne({ where: { id: session.id } });
    if (fresh) {
      await this.ensureSubscriber(fresh);
      await this.issueSignupTokenAndEmail(fresh);
    }
  }

  private async markPreferenceFailed(
    session: CheckoutSession,
    paymentId: string,
    status: string,
  ): Promise<void> {
    await this.sessionsRepo
      .createQueryBuilder()
      .update(CheckoutSession)
      .set({
        status: CheckoutStatus.FAILED,
        mpStatus: status,
        mpPaymentId: paymentId,
      })
      .where('id = :id AND status = :pending', {
        id: session.id,
        pending: CheckoutStatus.PENDING,
      })
      .execute();
  }

  private async handlePreapprovalNotification(
    preapprovalId: string,
  ): Promise<void> {
    const preapproval = await this.mercadoPago.getPreapproval(preapprovalId);
    const session = await this.sessionsRepo.findOne({
      where: { mpResourceId: preapprovalId },
    });
    if (!session) {
      this.logger.warn(
        `Preapproval ${preapprovalId} sem session correspondente`,
      );
      return;
    }

    session.mpStatus = preapproval.status ?? session.mpStatus;

    if (
      preapproval.status === 'cancelled' ||
      preapproval.status === 'paused'
    ) {
      if (
        session.status !== CheckoutStatus.CANCELLED &&
        session.status !== CheckoutStatus.FAILED
      ) {
        session.status = CheckoutStatus.CANCELLED;
        session.cancelledAt = new Date();
      }
    }

    await this.sessionsRepo.save(session);
  }

  private async handleAuthorizedPaymentNotification(
    authorizedPaymentId: string,
  ): Promise<void> {
    const authorizedPayment =
      await this.mercadoPago.getAuthorizedPayment(authorizedPaymentId);
    const preapprovalId = authorizedPayment.preapprovalId;
    if (!preapprovalId) {
      this.logger.warn(
        `authorized_payment ${authorizedPaymentId} sem preapproval_id — ignorando`,
      );
      return;
    }

    const session = await this.sessionsRepo.findOne({
      where: { mpResourceId: preapprovalId },
    });
    if (!session) {
      this.logger.warn(
        `authorized_payment ${authorizedPaymentId} referencia preapproval ${preapprovalId} sem session`,
      );
      return;
    }

    const paymentStatus = authorizedPayment.paymentStatus ?? '';
    const paymentId =
      authorizedPayment.paymentId ?? authorizedPayment.id;
    const amount =
      authorizedPayment.transactionAmount ?? session.firstChargeAmount;

    await this.recordSubscriptionPayment(
      session.id,
      paymentId,
      Number(amount),
      paymentStatus,
      authorizedPayment.raw,
    );

    if (paymentStatus === 'approved') {
      await this.handleApprovedRecurringPayment(
        session,
        preapprovalId,
        paymentId,
        paymentStatus,
      );
    } else if (paymentStatus === 'rejected' || paymentStatus === 'cancelled') {
      await this.handleRejectedRecurringPayment(session, paymentStatus);
    }
  }

  private async handleApprovedRecurringPayment(
    session: CheckoutSession,
    preapprovalId: string,
    paymentId: string,
    paymentStatus: string,
  ): Promise<void> {
    const isFirstCharge = session.status === CheckoutStatus.PENDING;

    if (isFirstCharge) {
      const result = await this.sessionsRepo
        .createQueryBuilder()
        .update(CheckoutSession)
        .set({
          status: CheckoutStatus.PAID,
          mpStatus: paymentStatus,
          mpPaymentId: paymentId,
          paidAt: new Date(),
          failedChargesCount: 0,
        })
        .where('id = :id AND status = :pending', {
          id: session.id,
          pending: CheckoutStatus.PENDING,
        })
        .execute();

      if (!result.affected) {
        this.logger.log(
          `Session ${session.id} já processada (PREAPPROVAL) — ignorando primeira cobrança duplicada`,
        );
        return;
      }

      const fresh = await this.sessionsRepo.findOne({
        where: { id: session.id },
      });
      if (fresh) {
        await this.ensureSubscriber(fresh);
        await this.issueSignupTokenAndEmail(fresh);
        await this.adjustPreapprovalAmount(fresh, preapprovalId);
      }
    } else {
      await this.sessionsRepo
        .createQueryBuilder()
        .update(CheckoutSession)
        .set({ mpStatus: paymentStatus, failedChargesCount: 0 })
        .where('id = :id', { id: session.id })
        .execute();

      await this.extendSubscriberAccess(session.id);

      if (!session.adhesionAdjusted) {
        const fresh = await this.sessionsRepo.findOne({
          where: { id: session.id },
        });
        if (fresh) await this.adjustPreapprovalAmount(fresh, preapprovalId);
      }
    }
  }

  private async extendSubscriberAccess(sessionId: string): Promise<void> {
    const subscriber = await this.subscribersRepo.findOne({
      where: { checkoutSessionId: sessionId },
      relations: ['user'],
    });
    if (!subscriber) {
      this.logger.warn(
        `extendSubscriberAccess: subscriber não encontrado para session ${sessionId}`,
      );
      return;
    }

    const baseDate = new Date();
    subscriber.endDate = addMonths(baseDate, 1);
    subscriber.active = true;
    await this.subscribersRepo.save(subscriber);

    if (subscriber.user && !subscriber.user.active) {
      subscriber.user.active = true;
      await this.usersRepo.save(subscriber.user);
      this.logger.log(
        `User ${subscriber.user.id} reativado após pagamento recorrente`,
      );
    }

    this.logger.log(
      `Subscriber ${subscriber.id} estendido até ${subscriber.endDate.toISOString()}`,
    );
  }

  private async handleRejectedRecurringPayment(
    session: CheckoutSession,
    paymentStatus: string,
  ): Promise<void> {
    if (session.status === CheckoutStatus.PENDING) {
      await this.sessionsRepo
        .createQueryBuilder()
        .update(CheckoutSession)
        .set({ status: CheckoutStatus.FAILED, mpStatus: paymentStatus })
        .where('id = :id AND status = :pending', {
          id: session.id,
          pending: CheckoutStatus.PENDING,
        })
        .execute();
    } else if (session.status === CheckoutStatus.PAID) {
      await this.sessionsRepo
        .createQueryBuilder()
        .update(CheckoutSession)
        .set({
          mpStatus: paymentStatus,
          lastFailedChargeAt: new Date(),
          failedChargesCount: () => '"failedChargesCount" + 1',
        })
        .where('id = :id', { id: session.id })
        .execute();
    }
  }

  private async ensureSubscriber(session: CheckoutSession): Promise<void> {
    try {
      const existing = await this.subscribersRepo.findOne({
        where: { checkoutSessionId: session.id },
      });
      if (existing) {
        this.logger.log(
          `Subscriber já existe para session ${session.id} — ignorando`,
        );
        return;
      }

      const startDate = session.paidAt ?? new Date();
      const endDate =
        session.billingCycle === BillingCycle.YEARLY
          ? addYears(startDate, 1)
          : addMonths(startDate, 1);
      const trialEndsAt = addDays(startDate, 7);

      const subscriber = this.subscribersRepo.create({
        leadId: session.leadId,
        planId: session.planId,
        checkoutSessionId: session.id,
        userId: null,
        active: true,
        startDate,
        endDate,
        trialEndsAt,
      });
      await this.subscribersRepo.save(subscriber);
      this.logger.log(
        `Subscriber criado para session ${session.id} (lead=${session.leadId}, plan=${session.planId}, endDate=${endDate?.toISOString() ?? 'null'})`,
      );
    } catch (err) {
      const code = (err as { code?: string }).code;
      if (code === '23505') {
        this.logger.log(
          `Subscriber para session ${session.id} já registrado — ignorando duplicata`,
        );
        return;
      }
      this.logger.error(
        `Falha ao criar Subscriber para session ${session.id}: ${(err as Error).message}`,
        (err as Error).stack,
      );
    }
  }

  private async recordSubscriptionPayment(
    checkoutSessionId: string,
    mpPaymentId: string,
    amount: number,
    mpStatus: string,
    rawPayload: Record<string, unknown>,
  ): Promise<void> {
    try {
      const entity = this.paymentsRepo.create({
        checkoutSessionId,
        mpPaymentId,
        amount,
        mpStatus,
        paidAt: mpStatus === 'approved' ? new Date() : null,
        rawPayload,
      });
      await this.paymentsRepo.save(entity);
    } catch (err) {
      const code = (err as { code?: string }).code;
      if (code !== '23505') throw err;
      this.logger.log(
        `SubscriptionPayment ${mpPaymentId} já registrado — ignorando duplicata`,
      );
    }
  }

  private async adjustPreapprovalAmount(
    session: CheckoutSession,
    preapprovalId: string,
  ): Promise<void> {
    if (session.recurringAmount === null || session.recurringAmount === undefined) {
      this.logger.warn(
        `Session ${session.id} sem recurringAmount — ajuste não executado`,
      );
      return;
    }

    for (let i = 0; i < PUT_ADJUST_RETRIES_MS.length; i++) {
      if (i > 0) await new Promise((r) => setTimeout(r, PUT_ADJUST_RETRIES_MS[i]));
      try {
        await this.mercadoPago.updatePreapprovalAmount(
          preapprovalId,
          session.recurringAmount,
        );
        await this.sessionsRepo
          .createQueryBuilder()
          .update(CheckoutSession)
          .set({ adhesionAdjusted: true })
          .where('id = :id', { id: session.id })
          .execute();
        this.logger.log(
          `Preapproval ${preapprovalId} ajustado para R$ ${session.recurringAmount}`,
        );
        return;
      } catch (err) {
        this.logger.warn(
          `Falha ao ajustar preapproval ${preapprovalId} (tentativa ${i + 1}): ${(err as Error).message}`,
        );
      }
    }

    this.logger.error(
      `Todas as tentativas de ajuste do preapproval ${preapprovalId} falharam — adhesionAdjusted permanece false para retry futuro`,
    );
  }

  private async issueSignupTokenAndEmail(
    session: CheckoutSession,
  ): Promise<void> {
    const [lead, plan] = await Promise.all([
      this.leadsRepo.findOne({ where: { id: session.leadId } }),
      this.plansRepo.findOne({ where: { id: session.planId } }),
    ]);
    if (!lead || !plan) {
      this.logger.error(
        `Lead/Plan não encontrados para session ${session.id} — email não enviado`,
      );
      return;
    }

    const existing = await this.tokensRepo.findOne({
      where: { checkoutSessionId: session.id },
    });
    if (existing) {
      this.logger.log(
        `SignupToken já emitido para session ${session.id} — email não reenviado`,
      );
      return;
    }

    const { plaintext } = await this.signupTokenService.generate(session.id);

    const appUrl = this.configService.get<string>('APP_URL') ?? '';
    const path =
      this.configService.get<string>('SIGNUP_COMPLETION_PATH') ??
      '/complete-signup';
    const ctaUrl = `${trimTrailingSlash(appUrl)}${path}?token=${encodeURIComponent(
      plaintext,
    )}`;
    const whatsappUrl = this.configService.get<string>('MAIL_WHATSAPP_URL');
    const ttlHours = Number(
      this.configService.get('SIGNUP_TOKEN_TTL_HOURS') ?? 72,
    );

    const html = buildSignupInvitationHtml({
      firstName: firstNameOf(lead.name),
      planName: plan.name,
      billingCycle: plan.billingCycle ?? BillingCycle.MONTHLY,
      ctaUrl,
      whatsappUrl,
      ttlHours,
    });

    await this.mailService.sendHtml({
      to: lead.email,
      subject: 'Finalize seu cadastro na GoverneAI',
      html,
    });
  }
}

function firstNameOf(fullName: string): string {
  const trimmed = (fullName ?? '').trim();
  if (!trimmed) return '';
  return trimmed.split(/\s+/)[0];
}

function trimTrailingSlash(value: string): string {
  return value.endsWith('/') ? value.slice(0, -1) : value;
}

function addYears(date: Date, years: number): Date {
  const result = new Date(date.getTime());
  result.setFullYear(result.getFullYear() + years);
  return result;
}

function addMonths(date: Date, months: number): Date {
  const result = new Date(date.getTime());
  result.setMonth(result.getMonth() + months);
  return result;
}

function addDays(date: Date, days: number): Date {
  const result = new Date(date.getTime());
  result.setDate(result.getDate() + days);
  return result;
}
