import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PoliticalContact } from './political-contact.entity';
import { TenantAwareService } from '../../shared/base/tenant-aware.service';

@Injectable()
export class PoliticalContactsService extends TenantAwareService<PoliticalContact> {
  constructor(
    @InjectRepository(PoliticalContact) repo: Repository<PoliticalContact>,
  ) {
    super(repo);
  }
}
