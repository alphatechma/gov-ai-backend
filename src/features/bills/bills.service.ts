import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { LegislativeBill } from './bill.entity';
import { TenantAwareService } from '../../shared/base/tenant-aware.service';

@Injectable()
export class BillsService extends TenantAwareService<LegislativeBill> {
  constructor(
    @InjectRepository(LegislativeBill) repo: Repository<LegislativeBill>,
  ) {
    super(repo);
  }
}
