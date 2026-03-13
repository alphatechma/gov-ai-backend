import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ExecutiveRequest } from './executive-request.entity';
import { TenantAwareService } from '../../shared/base/tenant-aware.service';

@Injectable()
export class ExecutiveRequestsService extends TenantAwareService<ExecutiveRequest> {
  constructor(
    @InjectRepository(ExecutiveRequest) repo: Repository<ExecutiveRequest>,
  ) {
    super(repo);
  }
}
