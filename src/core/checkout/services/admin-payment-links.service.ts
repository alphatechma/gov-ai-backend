import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { randomUUID } from 'crypto';
import {
  BillingCycle,
  CheckoutSource,
  CheckoutStatus,
  MpResourceType,
  PaymentType,
} from '../../../shared/enums';
import { Lead } from '../../leads/lead.entity';
import { Plan } from '../../plans/plan.entity';
import { CheckoutSession } from '../entities/checkout-session.entity';
import { CreateAdminPaymentLinkDto } from '../dto/create-admin-payment-link.dto';
import { MercadoPagoService } from './mercado-pago.service';

export interface AdminPaymentLinkResponse {
  checkoutSessionId: string;
  paymentType: PaymentType;
  mpResourceType: MpResourceType;
  mpResourceId: string;
  paymentUrl: string;
  status: CheckoutStatus;
  amounts: {
    adhesion: number;
    plan: number;
    firstCharge: number;
    recurring: number | null;
    currency: 'BRL';
  };
  lead: { id: string; name: string; email: string; phone: string };
  plan: { id: string; name: string; billingCycle: BillingCycle };
  createdAt: Date;
}

export interface AdminPaymentLinkListItem {
  checkoutSessionId: string;
  paymentType: PaymentType;
  mpResourceType: MpResourceType;
  paymentUrl: string;
  status: CheckoutStatus;
  mpStatus: string | null;
  firstChargeAmount: number;
  recurringAmount: number | null;
  paidAt: Date | null;
  createdAt: Date;
  lead: { id: string; name: string; email: string; phone: string } | null;
  plan: { id: string; name: string; billingCycle: BillingCycle } | null;
}

@Injectable()
export class AdminPaymentLinksService {
  constructor(
    @InjectRepository(CheckoutSession)
    private sessionsRepo: Repository<CheckoutSession>,
    @InjectRepository(Lead)
    private leadsRepo: Repository<Lead>,
    @InjectRepository(Plan)
    private plansRepo: Repository<Plan>,
    private mercadoPago: MercadoPagoService,
    private configService: ConfigService,
  ) {}

  async create(
    adminUserId: string,
    dto: CreateAdminPaymentLinkDto,
  ): Promise<AdminPaymentLinkResponse> {
    const lead = await this.leadsRepo.findOne({ where: { id: dto.leadId } });
    if (!lead) throw new NotFoundException('Lead não encontrado');

    const plan = await this.plansRepo.findOne({ where: { id: dto.planId } });
    if (!plan) throw new NotFoundException('Plano não encontrado');
    if (!plan.active) {
      throw new BadRequestException('Plano indisponível para contratação');
    }

    const adhesion = this.getAdhesionFee();
    const planAmount = Number(plan.price);
    const firstCharge = round2(adhesion + planAmount);
    const isRecurring = dto.paymentType === PaymentType.RECURRING;
    const recurringAmount = isRecurring ? round2(planAmount) : null;

    const sessionId = randomUUID();
    const apiUrl = this.mustGetEnv('API_URL');
    const landingUrl = this.mustGetEnv('LANDING_URL');
    const notificationUrl = `${trimTrailingSlash(apiUrl)}/api/checkout/webhook`;

    let mpResourceId: string;
    let initPoint: string;
    let mpResourceType: MpResourceType;

    if (isRecurring) {
      const result = await this.mercadoPago.createPreapproval({
        sessionId,
        reason: `GoverneAI - ${plan.name}`,
        payerEmail: lead.email,
        backUrl: `${trimTrailingSlash(landingUrl)}/?checkout=return&session=${sessionId}`,
        notificationUrl,
        transactionAmount: firstCharge,
        frequency: 1,
        frequencyType: 'months',
      });
      mpResourceId = result.id;
      initPoint = result.initPoint;
      mpResourceType = MpResourceType.PREAPPROVAL;
    } else {
      const result = await this.mercadoPago.createPreference({
        sessionId,
        payer: { name: lead.name, email: lead.email },
        items: [
          {
            title: 'Taxa de adesão GoverneAI',
            quantity: 1,
            unitPrice: round2(adhesion),
          },
          {
            title: `${plan.name} (pagamento único)`,
            quantity: 1,
            unitPrice: round2(planAmount),
          },
        ],
        backUrls: {
          success: `${trimTrailingSlash(landingUrl)}/?checkout=success&session=${sessionId}`,
          pending: `${trimTrailingSlash(landingUrl)}/?checkout=pending&session=${sessionId}`,
          failure: `${trimTrailingSlash(landingUrl)}/?checkout=failure&session=${sessionId}`,
        },
        notificationUrl,
        metadata: {
          checkoutSessionId: sessionId,
          leadId: lead.id,
          planId: plan.id,
          source: CheckoutSource.ADMIN,
          createdBy: adminUserId,
        },
      });
      mpResourceId = result.id;
      initPoint = result.initPoint;
      mpResourceType = MpResourceType.PREFERENCE;
    }

    const session = this.sessionsRepo.create({
      id: sessionId,
      leadId: lead.id,
      planId: plan.id,
      billingCycle: isRecurring ? BillingCycle.MONTHLY : BillingCycle.YEARLY,
      mpResourceType,
      mpResourceId,
      mpExternalReference: sessionId,
      adhesionAmount: round2(adhesion),
      planAmount: round2(planAmount),
      firstChargeAmount: firstCharge,
      recurringAmount,
      status: CheckoutStatus.PENDING,
      initPoint,
      source: CheckoutSource.ADMIN,
      createdBy: adminUserId,
    });
    const saved = await this.sessionsRepo.save(session);

    return {
      checkoutSessionId: saved.id,
      paymentType: dto.paymentType,
      mpResourceType,
      mpResourceId,
      paymentUrl: initPoint,
      status: saved.status,
      amounts: {
        adhesion: round2(adhesion),
        plan: round2(planAmount),
        firstCharge,
        recurring: recurringAmount,
        currency: 'BRL',
      },
      lead: {
        id: lead.id,
        name: lead.name,
        email: lead.email,
        phone: lead.phone,
      },
      plan: {
        id: plan.id,
        name: plan.name,
        billingCycle: plan.billingCycle,
      },
      createdAt: saved.createdAt,
    };
  }

  async list(limit = 50): Promise<AdminPaymentLinkListItem[]> {
    const safeLimit = Math.min(Math.max(limit, 1), 200);
    const sessions = await this.sessionsRepo
      .createQueryBuilder('s')
      .leftJoinAndSelect('s.lead', 'lead')
      .leftJoinAndSelect('s.plan', 'plan')
      .where('s.source = :source', { source: CheckoutSource.ADMIN })
      .orderBy('s.createdAt', 'DESC')
      .limit(safeLimit)
      .getMany();

    return sessions.map((s) => ({
      checkoutSessionId: s.id,
      paymentType:
        s.mpResourceType === MpResourceType.PREAPPROVAL
          ? PaymentType.RECURRING
          : PaymentType.ONE_TIME,
      mpResourceType: s.mpResourceType,
      paymentUrl: s.initPoint,
      status: s.status,
      mpStatus: s.mpStatus,
      firstChargeAmount: Number(s.firstChargeAmount),
      recurringAmount:
        s.recurringAmount === null ? null : Number(s.recurringAmount),
      paidAt: s.paidAt,
      createdAt: s.createdAt,
      lead: s.lead
        ? {
            id: s.lead.id,
            name: s.lead.name,
            email: s.lead.email,
            phone: s.lead.phone,
          }
        : null,
      plan: s.plan
        ? {
            id: s.plan.id,
            name: s.plan.name,
            billingCycle: s.plan.billingCycle,
          }
        : null,
    }));
  }

  private getAdhesionFee(): number {
    const raw = this.configService.get<string>('CHECKOUT_ADHESION_FEE');
    const value = raw ? parseFloat(raw) : 0;
    if (Number.isNaN(value) || value < 0) {
      throw new BadRequestException(
        'CHECKOUT_ADHESION_FEE inválido no servidor',
      );
    }
    return value;
  }

  private mustGetEnv(name: string): string {
    const value = this.configService.get<string>(name);
    if (!value) {
      throw new BadRequestException(`Env ${name} obrigatório não configurado`);
    }
    return value;
  }
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function trimTrailingSlash(value: string): string {
  return value.endsWith('/') ? value.slice(0, -1) : value;
}
