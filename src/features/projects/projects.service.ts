import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { LawProject } from './project.entity';
import { TenantAwareService } from '../../shared/base/tenant-aware.service';

@Injectable()
export class ProjectsService extends TenantAwareService<LawProject> {
  constructor(@InjectRepository(LawProject) repo: Repository<LawProject>) {
    super(repo);
  }

  async incrementViews(tenantId: string, id: string) {
    await this.repository.increment({ id, tenantId } as any, 'views', 1);
    return this.findOne(tenantId, id);
  }
}
