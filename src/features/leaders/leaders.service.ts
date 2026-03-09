import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Leader } from './leader.entity';
import { TenantAwareService } from '../../shared/base/tenant-aware.service';

@Injectable()
export class LeadersService extends TenantAwareService<Leader> {
  constructor(@InjectRepository(Leader) repo: Repository<Leader>) {
    super(repo);
  }
}
