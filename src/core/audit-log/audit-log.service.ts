import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditLog } from './audit-log.entity';
import { AuditAction } from '../../shared/enums';

@Injectable()
export class AuditLogService {
  constructor(
    @InjectRepository(AuditLog)
    private auditLogRepo: Repository<AuditLog>,
  ) {}

  async log(params: {
    tenantId?: string;
    userId?: string;
    action: AuditAction;
    entity: string;
    entityId?: string;
    changes?: Record<string, any>;
    ipAddress?: string;
  }) {
    const entry = this.auditLogRepo.create(params);
    return this.auditLogRepo.save(entry);
  }

  async findAll(tenantId?: string, page = 1, limit = 50) {
    const where = tenantId ? { tenantId } : {};
    const [items, total] = await this.auditLogRepo.findAndCount({
      where,
      relations: ['user'],
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    return { items, total, page, limit };
  }
}
