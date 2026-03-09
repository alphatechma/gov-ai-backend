import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { HelpRecord } from './help-record.entity';
import { TenantAwareService } from '../../shared/base/tenant-aware.service';

@Injectable()
export class HelpRecordsService extends TenantAwareService<HelpRecord> {
  constructor(@InjectRepository(HelpRecord) repo: Repository<HelpRecord>) {
    super(repo);
  }
}
