import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { QueryDeepPartialEntity } from 'typeorm/query-builder/QueryPartialEntity';
import { Subscriber } from './subscriber.entity';
import { Lead } from '../leads/lead.entity';
import { Plan } from '../plans/plan.entity';
import { CreateSubscriberDto } from './dto/create-subscriber.dto';
import { UpdateSubscriberDto } from './dto/update-subscriber.dto';
import { ListSubscribersDto } from './dto/list-subscribers.dto';

@Injectable()
export class SubscribersService {
  constructor(
    @InjectRepository(Subscriber)
    private subscribersRepo: Repository<Subscriber>,
    @InjectRepository(Lead)
    private leadsRepo: Repository<Lead>,
    @InjectRepository(Plan)
    private plansRepo: Repository<Plan>,
  ) {}

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
      relations: ['lead', 'plan'],
    });
    if (!subscriber) throw new NotFoundException('Assinante não encontrado');
    return subscriber;
  }

  async create(dto: CreateSubscriberDto) {
    const lead = await this.leadsRepo.findOne({ where: { id: dto.leadId } });
    if (!lead) throw new BadRequestException('Lead não encontrado');

    const plan = await this.plansRepo.findOne({ where: { id: dto.planId } });
    if (!plan) throw new BadRequestException('Plano não encontrado');

    if (dto.endDate && new Date(dto.endDate) <= new Date(dto.startDate)) {
      throw new BadRequestException(
        'Data de fim deve ser posterior à data de início',
      );
    }

    const subscriber = this.subscribersRepo.create({
      leadId: dto.leadId,
      planId: dto.planId,
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
