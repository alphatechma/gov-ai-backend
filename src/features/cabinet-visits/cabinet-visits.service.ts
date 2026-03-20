import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CabinetVisit } from './cabinet-visit.entity';
import { Visitor } from './visitor.entity';
import { HelpRecord } from '../help-records/help-record.entity';
import { HelpType } from '../help-records/help-type.entity';
import { Voter } from '../voters/voter.entity';
import { TenantAwareService } from '../../shared/base/tenant-aware.service';
import { CreateCabinetVisitDto } from './dto/create-cabinet-visit.dto';
import { CreateVisitorDto } from './dto/create-visitor.dto';
import { UpdateVisitorDto } from './dto/update-visitor.dto';
import { HelpStatus } from '../../shared/enums/features';

const CABINET_VISIT_TYPE = 'Visita ao Gabinete';

@Injectable()
export class CabinetVisitsService extends TenantAwareService<CabinetVisit> {
  constructor(
    @InjectRepository(CabinetVisit) repo: Repository<CabinetVisit>,
    @InjectRepository(Visitor)
    private visitorRepo: Repository<Visitor>,
    @InjectRepository(HelpRecord)
    private helpRecordRepo: Repository<HelpRecord>,
    @InjectRepository(HelpType)
    private helpTypeRepo: Repository<HelpType>,
    @InjectRepository(Voter)
    private voterRepo: Repository<Voter>,
  ) {
    super(repo);
  }

  // ── Visitors ──

  async findAllVisitors(
    tenantId: string,
    filters: { page?: number; limit?: number; search?: string },
  ) {
    const page = Math.max(1, filters.page || 1);
    const limit = Math.min(200, Math.max(1, filters.limit || 50));
    const offset = (page - 1) * limit;

    const qb = this.visitorRepo
      .createQueryBuilder('v')
      .where('v."tenantId" = :tenantId', { tenantId });

    if (filters.search) {
      qb.andWhere(
        '(v.name ILIKE :q OR v.phone ILIKE :q OR v.organization ILIKE :q)',
        { q: `%${filters.search}%` },
      );
    }

    const total = await qb.getCount();
    const data = await qb
      .orderBy('v.name', 'ASC')
      .offset(offset)
      .limit(limit)
      .getMany();

    return { data, total, page, limit };
  }

  async findOneVisitor(tenantId: string, id: string) {
    const visitor = await this.visitorRepo.findOne({
      where: { id, tenantId },
    });
    if (!visitor) throw new BadRequestException('Visitante não encontrado');
    return visitor;
  }

  async createVisitor(tenantId: string, dto: CreateVisitorDto) {
    const entity = this.visitorRepo.create({ ...dto, tenantId });
    return this.visitorRepo.save(entity);
  }

  async updateVisitor(tenantId: string, id: string, dto: UpdateVisitorDto) {
    const visitor = await this.findOneVisitor(tenantId, id);
    Object.assign(visitor, dto);
    return this.visitorRepo.save(visitor);
  }

  async removeVisitor(tenantId: string, id: string) {
    const visitor = await this.findOneVisitor(tenantId, id);
    return this.visitorRepo.remove(visitor);
  }

  async searchVisitors(tenantId: string, search: string) {
    return this.visitorRepo
      .createQueryBuilder('v')
      .where('v."tenantId" = :tenantId', { tenantId })
      .andWhere('(v.name ILIKE :q OR v.phone ILIKE :q)', {
        q: `%${search}%`,
      })
      .orderBy('v.name', 'ASC')
      .limit(20)
      .getMany();
  }

  async checkVoterMatch(tenantId: string, visitorId: string) {
    const visitor = await this.findOneVisitor(tenantId, visitorId);

    const qb = this.voterRepo
      .createQueryBuilder('v')
      .where('v."tenantId" = :tenantId', { tenantId })
      .andWhere('LOWER(TRIM(v.name)) = LOWER(TRIM(:name))', {
        name: visitor.name,
      });

    if (visitor.phone) {
      qb.andWhere("REPLACE(REPLACE(REPLACE(v.phone, ' ', ''), '-', ''), '(', '') = REPLACE(REPLACE(REPLACE(:phone, ' ', ''), '-', ''), '(', '')", {
        phone: visitor.phone.replace(/[\s\-\(\)]/g, ''),
      });
    }

    const voter = await qb.getOne();

    if (voter) {
      return {
        isVoter: true,
        voter: {
          id: voter.id,
          name: voter.name,
          phone: voter.phone,
          supportLevel: voter.supportLevel,
        },
      };
    }

    return { isVoter: false, voter: null };
  }

  async checkVoterMatchByData(
    tenantId: string,
    name: string,
    phone?: string,
  ) {
    const qb = this.voterRepo
      .createQueryBuilder('v')
      .where('v."tenantId" = :tenantId', { tenantId })
      .andWhere('LOWER(TRIM(v.name)) = LOWER(TRIM(:name))', { name });

    if (phone) {
      const cleanPhone = phone.replace(/[\s\-\(\)]/g, '');
      qb.andWhere("REPLACE(REPLACE(REPLACE(v.phone, ' ', ''), '-', ''), '(', '') = :phone", {
        phone: cleanPhone,
      });
    }

    const voter = await qb.getOne();

    if (voter) {
      return {
        isVoter: true,
        voter: {
          id: voter.id,
          name: voter.name,
          phone: voter.phone,
          supportLevel: voter.supportLevel,
        },
      };
    }

    return { isVoter: false, voter: null };
  }

  // ── Cabinet Visits ──

  private async ensureHelpType(tenantId: string) {
    let type = await this.helpTypeRepo.findOne({
      where: { tenantId, name: CABINET_VISIT_TYPE },
    });
    if (!type) {
      type = this.helpTypeRepo.create({
        tenantId,
        name: CABINET_VISIT_TYPE,
      });
      await this.helpTypeRepo.save(type);
    }
    return type;
  }

  async createCabinetVisit(tenantId: string, dto: CreateCabinetVisitDto) {
    if (!dto.visitorId && !dto.voterId) {
      throw new BadRequestException(
        'Informe um visitante ou eleitor para a visita',
      );
    }

    await this.ensureHelpType(tenantId);

    // Create the HelpRecord (atendimento)
    const helpRecordData: Record<string, any> = {
      tenantId,
      type: CABINET_VISIT_TYPE,
      status: HelpStatus.COMPLETED,
      observations: dto.purpose || 'Visita ao gabinete',
      date: dto.checkInAt
        ? new Date(dto.checkInAt).toISOString().slice(0, 10)
        : new Date().toISOString().slice(0, 10),
    };
    if (dto.voterId) helpRecordData.voterId = dto.voterId;
    const savedHelpRecord = await this.helpRecordRepo.save(
      this.helpRecordRepo.create(helpRecordData as any),
    );

    // Create the CabinetVisit
    const cabinetVisitData: Record<string, any> = {
      tenantId,
      helpRecordId: (savedHelpRecord as any).id,
      checkInAt: dto.checkInAt ? new Date(dto.checkInAt) : new Date(),
    };
    if (dto.visitorId) cabinetVisitData.visitorId = dto.visitorId;
    if (dto.voterId) cabinetVisitData.voterId = dto.voterId;
    if (dto.purpose) cabinetVisitData.purpose = dto.purpose;
    if (dto.attendedBy) cabinetVisitData.attendedBy = dto.attendedBy;
    if (dto.observations) cabinetVisitData.observations = dto.observations;

    const cabinetVisit = this.repository.create(cabinetVisitData as any);

    return this.repository.save(cabinetVisit);
  }

  async findAllPaginated(
    tenantId: string,
    filters: {
      page?: number;
      limit?: number;
      search?: string;
      dateFrom?: string;
      dateTo?: string;
    },
  ) {
    const page = Math.max(1, filters.page || 1);
    const limit = Math.min(200, Math.max(1, filters.limit || 50));
    const offset = (page - 1) * limit;

    const qb = this.repository
      .createQueryBuilder('cv')
      .leftJoinAndSelect('cv.visitor', 'visitor')
      .leftJoin('voters', 'voter', 'voter.id = cv."voterId"::uuid')
      .addSelect(['voter.id', 'voter.name', 'voter.phone', 'voter.supportLevel'])
      .where('cv."tenantId" = :tenantId', { tenantId });

    if (filters.search) {
      qb.andWhere(
        '(visitor.name ILIKE :q OR voter.name ILIKE :q OR cv.purpose ILIKE :q OR cv."attendedBy" ILIKE :q)',
        { q: `%${filters.search}%` },
      );
    }
    if (filters.dateFrom) {
      qb.andWhere('cv."checkInAt" >= :dateFrom', {
        dateFrom: filters.dateFrom,
      });
    }
    if (filters.dateTo) {
      qb.andWhere('cv."checkInAt" <= :dateTo', {
        dateTo: `${filters.dateTo}T23:59:59`,
      });
    }

    const total = await qb.getCount();
    const raw = await qb
      .orderBy('cv."checkInAt"', 'DESC')
      .offset(offset)
      .limit(limit)
      .getRawAndEntities();

    const data = raw.entities.map((cv, i) => ({
      ...cv,
      voterName: raw.raw[i]?.voter_name || null,
      voterPhone: raw.raw[i]?.voter_phone || null,
      voterSupportLevel: raw.raw[i]?.voter_supportLevel || null,
    }));

    return { data, total, page, limit };
  }

  async findOneCabinetVisit(tenantId: string, id: string) {
    const visit = await this.repository
      .createQueryBuilder('cv')
      .leftJoinAndSelect('cv.visitor', 'visitor')
      .leftJoin('voters', 'voter', 'voter.id = cv."voterId"::uuid')
      .addSelect(['voter.id', 'voter.name', 'voter.phone', 'voter.supportLevel'])
      .where('cv.id = :id', { id })
      .andWhere('cv."tenantId" = :tenantId', { tenantId })
      .getOne();

    if (!visit) throw new BadRequestException('Visita não encontrada');
    return visit;
  }

  async removeCabinetVisit(tenantId: string, id: string) {
    const visit = await this.findOne(tenantId, id);
    if (visit.helpRecordId) {
      await this.helpRecordRepo.delete({
        id: visit.helpRecordId,
        tenantId,
      });
    }
    return this.repository.remove(visit);
  }

  // ── Dashboard ──

  async getDashboardStats(tenantId: string) {
    const now = new Date();
    const todayStart = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
    ).toISOString();
    const last7 = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate() - 7,
    ).toISOString();
    const last30 = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate() - 30,
    ).toISOString();

    const baseWhere = 'cv."tenantId" = :tenantId';

    const [
      todayResult,
      last7Result,
      last30Result,
      totalVisitorsResult,
      topVisitorsResult,
      dailyResult,
      voterVisitsResult,
    ] = await Promise.all([
      // Today
      this.repository
        .createQueryBuilder('cv')
        .where(baseWhere, { tenantId })
        .andWhere('cv."checkInAt" >= :todayStart', { todayStart })
        .getCount(),
      // Last 7 days
      this.repository
        .createQueryBuilder('cv')
        .where(baseWhere, { tenantId })
        .andWhere('cv."checkInAt" >= :last7', { last7 })
        .getCount(),
      // Last 30 days
      this.repository
        .createQueryBuilder('cv')
        .where(baseWhere, { tenantId })
        .andWhere('cv."checkInAt" >= :last30', { last30 })
        .getCount(),
      // Total visitors
      this.visitorRepo.count({ where: { tenantId } }),
      // Top 5 visitors (last 30 days)
      this.repository
        .createQueryBuilder('cv')
        .leftJoin('visitors', 'v', 'v.id = cv."visitorId"::uuid')
        .leftJoin('voters', 'voter', 'voter.id = cv."voterId"::uuid')
        .select(
          'COALESCE(v.name, voter.name)',
          'name',
        )
        .addSelect('COUNT(*)', 'count')
        .addSelect(
          'CASE WHEN cv."voterId" IS NOT NULL THEN true ELSE false END',
          'isVoter',
        )
        .where(baseWhere, { tenantId })
        .andWhere('cv."checkInAt" >= :last30', { last30 })
        .groupBy('COALESCE(v.name, voter.name)')
        .addGroupBy(
          'CASE WHEN cv."voterId" IS NOT NULL THEN true ELSE false END',
        )
        .orderBy('count', 'DESC')
        .limit(5)
        .getRawMany(),
      // Daily visits (last 30 days)
      this.repository
        .createQueryBuilder('cv')
        .select('DATE(cv."checkInAt")', 'date')
        .addSelect('COUNT(*)', 'count')
        .where(baseWhere, { tenantId })
        .andWhere('cv."checkInAt" >= :last30', { last30 })
        .groupBy('DATE(cv."checkInAt")')
        .orderBy('date', 'ASC')
        .getRawMany(),
      // Voter visits count
      this.repository
        .createQueryBuilder('cv')
        .where(baseWhere, { tenantId })
        .andWhere('cv."voterId" IS NOT NULL')
        .andWhere('cv."checkInAt" >= :last30', { last30 })
        .getCount(),
    ]);

    return {
      today: todayResult,
      last7Days: last7Result,
      last30Days: last30Result,
      totalVisitors: totalVisitorsResult,
      voterVisitsLast30: voterVisitsResult,
      nonVoterVisitsLast30: last30Result - voterVisitsResult,
      topVisitors: topVisitorsResult.map((r: any) => ({
        name: r.name,
        count: parseInt(r.count, 10),
        isVoter: r.isVoter === true || r.isVoter === 'true',
      })),
      dailyVisits: dailyResult.map((r: any) => ({
        date: r.date,
        count: parseInt(r.count, 10),
      })),
    };
  }
}
