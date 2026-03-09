import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Visit } from './visit.entity';
import { TenantAwareService } from '../../shared/base/tenant-aware.service';

@Injectable()
export class VisitsService extends TenantAwareService<Visit> {
  constructor(@InjectRepository(Visit) repo: Repository<Visit>) {
    super(repo);
  }
}
