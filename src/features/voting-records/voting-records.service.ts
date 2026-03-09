import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { VotingRecord } from './voting-record.entity';
import { TenantAwareService } from '../../shared/base/tenant-aware.service';

@Injectable()
export class VotingRecordsService extends TenantAwareService<VotingRecord> {
  constructor(@InjectRepository(VotingRecord) repo: Repository<VotingRecord>) {
    super(repo);
  }
}
