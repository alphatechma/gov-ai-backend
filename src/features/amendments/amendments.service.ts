import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Amendment } from './amendment.entity';
import { TenantAwareService } from '../../shared/base/tenant-aware.service';

@Injectable()
export class AmendmentsService extends TenantAwareService<Amendment> {
  constructor(@InjectRepository(Amendment) repo: Repository<Amendment>) {
    super(repo);
  }
}
