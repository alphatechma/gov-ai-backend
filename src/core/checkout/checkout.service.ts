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
  CheckoutStatus,
  LeadFunnelStatus,
  MpResourceType,
} from '../../shared/enums';
import { LeadsService } from '../leads/leads.service';
import { PlansService } from '../plans/plans.service';
import { CheckoutSession } from './entities/checkout-session.entity';
import { CreateCheckoutSessionDto } from './dto/create-checkout-session.dto';
import { CheckoutSessionResponseDto } from './dto/checkout-session-response.dto';
import { MercadoPagoService } from './services/mercado-pago.service';

@Injectable()
export class CheckoutService {
  constructor(
    @InjectRepository(CheckoutSession)
    private sessionsRepo: Repository<CheckoutSession>,
    private leadsService: LeadsService,
    private plansService: PlansService,
    private mercadoPago: MercadoPagoService,
    private configService: ConfigService,
  ) {}

  async createSession(
    dto: CreateCheckoutSessionDto,
  ): Promise<CheckoutSessionResponseDto> {
    const plan = await this.plansService.findOne(dto.planId);
    if (!plan.active) {
      throw new BadRequestException('Plano indisponível para contratação');
    }

    const lead = await this.leadsService.upsertByEmail({
      name: dto.name,
      email: dto.email,
      phone: dto.phone,
      source: 'landing-page-checkout',
      funnelStatus: LeadFunnelStatus.NEGOCIANDO,
      planId: plan.id,
      notes: `Interesse no plano ${plan.name} (id: ${plan.id})`,
    });

    const adhesion = this.getAdhesionFee();
    const planAmount = Number(plan.price);
    const firstCharge = round2(adhesion + planAmount);
    const isMonthly = plan.billingCycle === BillingCycle.MONTHLY;
    const recurringAmount = isMonthly ? round2(planAmount) : null;

    const sessionId = randomUUID();
    const apiUrl = this.mustGetEnv('API_URL');
    const landingUrl = this.mustGetEnv('LANDING_URL');
    const notificationUrl = `${trimTrailingSlash(apiUrl)}/api/checkout/webhook`;

    let mpResourceId: string;
    let initPoint: string;
    let sandboxInitPoint: string | undefined;

    if (isMonthly) {
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
            title: `${plan.name} (anual)`,
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
        },
      });
      mpResourceId = result.id;
      initPoint = result.initPoint;
      sandboxInitPoint = result.sandboxInitPoint;
    }

    const session = this.sessionsRepo.create({
      id: sessionId,
      leadId: lead.id,
      planId: plan.id,
      billingCycle: plan.billingCycle,
      mpResourceType: isMonthly
        ? MpResourceType.PREAPPROVAL
        : MpResourceType.PREFERENCE,
      mpResourceId,
      mpExternalReference: sessionId,
      adhesionAmount: round2(adhesion),
      planAmount: round2(planAmount),
      firstChargeAmount: firstCharge,
      recurringAmount,
      status: CheckoutStatus.PENDING,
      initPoint,
    });
    const saved = await this.sessionsRepo.save(session);

    return {
      checkoutSessionId: saved.id,
      mpResourceType: saved.mpResourceType,
      mpResourceId,
      initPoint,
      sandboxInitPoint,
      billingCycle: plan.billingCycle,
      amounts: {
        adhesion: round2(adhesion),
        plan: round2(planAmount),
        firstCharge,
        recurring: recurringAmount,
        currency: 'BRL',
      },
    };
  }

  async findSessionById(id: string): Promise<CheckoutSession> {
    const session = await this.sessionsRepo.findOne({ where: { id } });
    if (!session) throw new NotFoundException('Sessão de checkout não encontrada');
    return session;
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
