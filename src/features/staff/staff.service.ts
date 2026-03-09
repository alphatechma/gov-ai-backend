import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { StaffMember } from './staff.entity';
import { TenantAwareService } from '../../shared/base/tenant-aware.service';

@Injectable()
export class StaffService extends TenantAwareService<StaffMember> {
  constructor(@InjectRepository(StaffMember) repo: Repository<StaffMember>) {
    super(repo);
  }
}
