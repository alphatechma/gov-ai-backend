import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Task } from './task.entity';
import { TenantAwareService } from '../../shared/base/tenant-aware.service';

@Injectable()
export class TasksService extends TenantAwareService<Task> {
  constructor(@InjectRepository(Task) repo: Repository<Task>) {
    super(repo);
  }

  async reorder(tenantId: string, items: { id: string; column: string; position: number }[]) {
    const promises = items.map((item) =>
      this.repository.update({ id: item.id, tenantId } as any, { column: item.column, position: item.position } as any),
    );
    await Promise.all(promises);
    return { success: true };
  }
}
