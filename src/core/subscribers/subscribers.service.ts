import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { QueryDeepPartialEntity } from 'typeorm/query-builder/QueryPartialEntity';
import { Subscriber } from './subscriber.entity';
import { Lead } from '../leads/lead.entity';
import { Plan } from '../plans/plan.entity';
import { User } from '../users/user.entity';
import { CheckoutSession } from '../checkout/entities/checkout-session.entity';
import { SubscriptionPayment } from '../checkout/entities/subscription-payment.entity';
import { MercadoPagoService } from '../checkout/services/mercado-pago.service';
import { BillingCycle, CheckoutStatus } from '../../shared/enums';
import { CreateSubscriberDto } from './dto/create-subscriber.dto';
import { UpdateSubscriberDto } from './dto/update-subscriber.dto';
import { ListSubscribersDto } from './dto/list-subscribers.dto';

@Injectable()
export class SubscribersService {
  private readonly logger = new Logger(SubscribersService.name);

  constructor(
    @InjectRepository(Subscriber)
    private subscribersRepo: Repository<Subscriber>,
    @InjectRepository(Lead)
    private leadsRepo: Repository<Lead>,
    @InjectRepository(Plan)
    private plansRepo: Repository<Plan>,
    @InjectRepository(User)
    private usersRepo: Repository<User>,
    @InjectRepository(CheckoutSession)
    private sessionsRepo: Repository<CheckoutSession>,
    @InjectRepository(SubscriptionPayment)
    private paymentsRepo: Repository<SubscriptionPayment>,
    private mercadoPago: MercadoPagoService,
  ) {}

  async findActiveByUser(userId: string): Promise<Subscriber | null> {
    return this.subscribersRepo.findOne({
      where: { userId, active: true },
      relations: ['plan', 'checkoutSession'],
    });
  }

  private async findActiveByTenant(tenantId: string): Promise<Subscriber | null> {
    return this.subscribersRepo
      .createQueryBuilder('subscriber')
      .leftJoinAndSelect('subscriber.plan', 'plan')
      .leftJoinAndSelect('subscriber.checkoutSession', 'checkoutSession')
      .innerJoin('subscriber.user', 'user')
      .where('user.tenantId = :tenantId', { tenantId })
      .andWhere('subscriber.active = true')
      .orderBy('subscriber.createdAt', 'DESC')
      .getOne();
  }

  async findActiveForContext(
    userId: string,
    tenantId?: string | null,
  ): Promise<Subscriber | null> {
    if (tenantId) {
      const tenantSubscription = await this.findActiveByTenant(tenantId);
      if (tenantSubscription) return tenantSubscription;
    }
    return this.findActiveByUser(userId);
  }

  async isTenantSubscriptionActive(tenantId: string): Promise<boolean> {
    if (!tenantId) return false;
    const sub = await this.subscribersRepo
      .createQueryBuilder('s')
      .innerJoin('s.user', 'u')
      .where('u.tenantId = :tenantId', { tenantId })
      .andWhere('s.active = true')
      .getOne();
    return !!sub;
  }

  async cancelByContext(
    userId: string,
    tenantId?: string | null,
  ): Promise<{ cancelledAt: Date; refundedPayments: number; inTrial: boolean }> {
    const subscriber = await this.findActiveForContext(userId, tenantId);
    if (!subscriber) {
      throw new NotFoundException('Assinatura ativa não encontrada');
    }

    const now = new Date();
    const inTrial =
      !!subscriber.trialEndsAt && subscriber.trialEndsAt > now;
    const cycle = subscriber.plan?.billingCycle;
    const session = subscriber.checkoutSession;

    if (cycle !== BillingCycle.MONTHLY && !inTrial) {
      throw new BadRequestException(
        'Plano anual só pode ser cancelado durante o período de teste de 7 dias',
      );
    }

    if (cycle === BillingCycle.MONTHLY) {
      if (!session?.mpResourceId) {
        throw new BadRequestException(
          'Assinatura sem identificador no Mercado Pago',
        );
      }
      await this.mercadoPago.cancelPreapproval(session.mpResourceId);
    }

    let refundedPayments = 0;
    if (inTrial && session) {
      const payments = await this.paymentsRepo.find({
        where: { checkoutSessionId: session.id, mpStatus: 'approved' },
      });
      for (const p of payments) {
        try {
          await this.mercadoPago.refundPayment(p.mpPaymentId);
          refundedPayments++;
        } catch (err) {
          this.logger.error(
            `Falha ao estornar pagamento ${p.mpPaymentId} (subscriber ${subscriber.id}): ${(err as Error).message}`,
          );
        }
      }
    }

    subscriber.active = false;
    subscriber.endDate = now;
    await this.subscribersRepo.save(subscriber);

    if (session && session.status !== CheckoutStatus.CANCELLED) {
      session.status = CheckoutStatus.CANCELLED;
      session.cancelledAt = now;
      session.mpStatus = 'cancelled';
      await this.sessionsRepo.save(session);
    }

    return { cancelledAt: now, refundedPayments, inTrial };
  }

  async findAll(query: ListSubscribersDto) {
    const page = query.page && query.page > 0 ? query.page : 1;
    const limit =
      query.limit && query.limit > 0 ? Math.min(query.limit, 200) : 50;

    const qb = this.subscribersRepo
      .createQueryBuilder('subscriber')
      .leftJoinAndSelect('subscriber.lead', 'lead')
      .leftJoinAndSelect('subscriber.plan', 'plan');

    if (query.leadName) {
      qb.andWhere('lead.name ILIKE :leadName', {
        leadName: `%${query.leadName}%`,
      });
    }
    if (query.leadEmail) {
      qb.andWhere('lead.email ILIKE :leadEmail', {
        leadEmail: `%${query.leadEmail}%`,
      });
    }
    if (query.leadPhone) {
      qb.andWhere('lead.phone ILIKE :leadPhone', {
        leadPhone: `%${query.leadPhone}%`,
      });
    }
    if (query.planId) {
      qb.andWhere('subscriber.planId = :planId', { planId: query.planId });
    }
    if (typeof query.active === 'boolean') {
      qb.andWhere('subscriber.active = :active', { active: query.active });
    }

    qb.orderBy('subscriber.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    const [data, total] = await qb.getManyAndCount();
    return { data, total, page, limit };
  }

  async findOne(id: string) {
    const subscriber = await this.subscribersRepo.findOne({
      where: { id },
      relations: ['lead', 'plan', 'user'],
    });
    if (!subscriber) throw new NotFoundException('Assinante não encontrado');
    return subscriber;
  }

  async create(dto: CreateSubscriberDto) {
    const lead = await this.leadsRepo.findOne({ where: { id: dto.leadId } });
    if (!lead) throw new BadRequestException('Lead não encontrado');

    const plan = await this.plansRepo.findOne({ where: { id: dto.planId } });
    if (!plan) throw new BadRequestException('Plano não encontrado');

    if (dto.userId) {
      const user = await this.usersRepo.findOne({ where: { id: dto.userId } });
      if (!user) throw new BadRequestException('Usuário não encontrado');
      const existing = await this.subscribersRepo.findOne({
        where: { userId: dto.userId },
      });
      if (existing) {
        throw new BadRequestException(
          'Este usuário já está vinculado a outro assinante',
        );
      }
    }

    if (dto.endDate && new Date(dto.endDate) <= new Date(dto.startDate)) {
      throw new BadRequestException(
        'Data de fim deve ser posterior à data de início',
      );
    }

    const subscriber = this.subscribersRepo.create({
      leadId: dto.leadId,
      planId: dto.planId,
      userId: dto.userId ?? null,
      active: dto.active ?? true,
      startDate: new Date(dto.startDate),
      endDate: dto.endDate ? new Date(dto.endDate) : null,
    });
    const saved = await this.subscribersRepo.save(subscriber);
    return this.findOne(saved.id);
  }

  async update(id: string, dto: UpdateSubscriberDto) {
    const subscriber = await this.findOne(id);

    if (dto.leadId && dto.leadId !== subscriber.leadId) {
      const lead = await this.leadsRepo.findOne({ where: { id: dto.leadId } });
      if (!lead) throw new BadRequestException('Lead não encontrado');
    }
    if (dto.planId && dto.planId !== subscriber.planId) {
      const plan = await this.plansRepo.findOne({ where: { id: dto.planId } });
      if (!plan) throw new BadRequestException('Plano não encontrado');
    }
    if (dto.userId !== undefined && dto.userId !== subscriber.userId) {
      if (dto.userId) {
        const user = await this.usersRepo.findOne({
          where: { id: dto.userId },
        });
        if (!user) throw new BadRequestException('Usuário não encontrado');
        const existing = await this.subscribersRepo.findOne({
          where: { userId: dto.userId },
        });
        if (existing && existing.id !== id) {
          throw new BadRequestException(
            'Este usuário já está vinculado a outro assinante',
          );
        }
      }
    }

    const nextStart = dto.startDate
      ? new Date(dto.startDate)
      : subscriber.startDate;
    const nextEnd =
      dto.endDate === null
        ? null
        : dto.endDate
          ? new Date(dto.endDate)
          : subscriber.endDate;

    if (nextEnd && nextEnd <= nextStart) {
      throw new BadRequestException(
        'Data de fim deve ser posterior à data de início',
      );
    }

    const patch: QueryDeepPartialEntity<Subscriber> = {};
    if (dto.leadId !== undefined) patch.leadId = dto.leadId;
    if (dto.planId !== undefined) patch.planId = dto.planId;
    if (dto.userId !== undefined) patch.userId = dto.userId ?? null;
    if (dto.active !== undefined) patch.active = dto.active;
    if (dto.startDate !== undefined) patch.startDate = nextStart;
    if (dto.endDate !== undefined) patch.endDate = nextEnd;

    if (Object.keys(patch).length > 0) {
      await this.subscribersRepo.update(id, patch);
    }

    return this.findOne(id);
  }

  async remove(id: string) {
    const subscriber = await this.findOne(id);
    return this.subscribersRepo.remove(subscriber);
  }
}
