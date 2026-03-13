import { NotFoundException } from '@nestjs/common';
import { Repository, FindOptionsWhere, DeepPartial } from 'typeorm';

export abstract class TenantAwareService<
  T extends { id: string; tenantId: string },
> {
  constructor(protected readonly repository: Repository<T>) {}

  async findAll(tenantId: string, filters?: FindOptionsWhere<T>) {
    const where = { tenantId, ...filters } as FindOptionsWhere<T>;
    return this.repository.find({
      where,
      order: { createdAt: 'DESC' } as any,
    });
  }

  async findOne(tenantId: string, id: string) {
    const entity = await this.repository.findOne({
      where: { id, tenantId } as FindOptionsWhere<T>,
    });
    if (!entity) throw new NotFoundException('Registro não encontrado');
    return entity;
  }

  async create(tenantId: string, dto: DeepPartial<T>) {
    const entity = this.repository.create({
      ...dto,
      tenantId,
    } as DeepPartial<T>);
    return this.repository.save(entity);
  }

  async update(tenantId: string, id: string, dto: DeepPartial<T>) {
    const entity = await this.findOne(tenantId, id);
    Object.assign(entity, dto);
    return this.repository.save(entity);
  }

  async remove(tenantId: string, id: string) {
    const entity = await this.findOne(tenantId, id);
    return this.repository.remove(entity);
  }
}
