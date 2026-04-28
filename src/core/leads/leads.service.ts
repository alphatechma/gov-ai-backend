import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Lead } from './lead.entity';
import { Subscriber } from '../subscribers/subscriber.entity';
import { CreateLeadDto } from './dto/create-lead.dto';
import { UpdateLeadDto } from './dto/update-lead.dto';
import { ListLeadsDto } from './dto/list-leads.dto';

@Injectable()
export class LeadsService {
  constructor(
    @InjectRepository(Lead)
    private leadsRepo: Repository<Lead>,
    @InjectRepository(Subscriber)
    private subscribersRepo: Repository<Subscriber>,
  ) {}

  async findAll(query: ListLeadsDto) {
    const page = query.page && query.page > 0 ? query.page : 1;
    const limit = query.limit && query.limit > 0 ? Math.min(query.limit, 200) : 50;

    const qb = this.leadsRepo
      .createQueryBuilder('lead')
      .leftJoinAndSelect('lead.plan', 'plan');

    if (query.name) {
      qb.andWhere('lead.name ILIKE :name', { name: `%${query.name}%` });
    }
    if (query.email) {
      qb.andWhere('lead.email ILIKE :email', { email: `%${query.email}%` });
    }
    if (query.phone) {
      qb.andWhere('lead.phone ILIKE :phone', { phone: `%${query.phone}%` });
    }
    if (query.funnelStatus) {
      qb.andWhere('lead.funnelStatus = :funnelStatus', {
        funnelStatus: query.funnelStatus,
      });
    }
    if (query.source) {
      qb.andWhere('lead.source = :source', { source: query.source });
    }
    if (query.planId) {
      qb.andWhere('lead.planId = :planId', { planId: query.planId });
    }

    qb.andWhere((sub) => {
      const subQuery = sub
        .subQuery()
        .select('a.leadId')
        .from(Subscriber, 'a')
        .getQuery();
      return `lead.id NOT IN ${subQuery}`;
    });

    qb.orderBy('lead.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    const [data, total] = await qb.getManyAndCount();
    return { data, total, page, limit };
  }

  async findOne(id: string) {
    const lead = await this.leadsRepo.findOne({
      where: { id },
      relations: ['plan'],
    });
    if (!lead) throw new NotFoundException('Lead não encontrado');
    return lead;
  }

  create(dto: CreateLeadDto) {
    const now = new Date();
    const lead = this.leadsRepo.create({
      ...(dto as Partial<Lead>),
      lastInteraction: now,
      nextInteraction: new Date(now.getTime() + 15 * 60 * 1000),
    });
    return this.leadsRepo.save(lead);
  }

  async upsertByEmail(dto: CreateLeadDto): Promise<Lead> {
    const normalizedEmail = dto.email.trim().toLowerCase();
    const existing = await this.leadsRepo.findOne({
      where: { email: normalizedEmail },
    });
    const now = new Date();

    if (!existing) {
      return this.create({ ...dto, email: normalizedEmail });
    }

    existing.name = dto.name ?? existing.name;
    existing.phone = dto.phone ?? existing.phone;
    if (dto.source !== undefined) existing.source = dto.source;
    if (dto.notes !== undefined) existing.notes = dto.notes;
    if (dto.funnelStatus !== undefined) existing.funnelStatus = dto.funnelStatus;
    if (dto.planId !== undefined) existing.planId = dto.planId;
    existing.lastInteraction = now;
    existing.nextInteraction = new Date(now.getTime() + 15 * 60 * 1000);
    return this.leadsRepo.save(existing);
  }

  async update(id: string, dto: UpdateLeadDto) {
    const lead = await this.findOne(id);
    Object.assign(lead, dto);
    return this.leadsRepo.save(lead);
  }

  async remove(id: string) {
    const lead = await this.findOne(id);
    return this.leadsRepo.remove(lead);
  }
}
