import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Tenant } from './tenant.entity';
import { CreateTenantDto } from './dto/create-tenant.dto';
import { UpdateTenantDto } from './dto/update-tenant.dto';
import { TenantModule } from '../modules/tenant-module.entity';
import { SystemModule } from '../modules/system-module.entity';

@Injectable()
export class TenantsService {
  constructor(
    @InjectRepository(Tenant)
    private tenantsRepo: Repository<Tenant>,
    @InjectRepository(TenantModule)
    private tenantModuleRepo: Repository<TenantModule>,
    @InjectRepository(SystemModule)
    private systemModuleRepo: Repository<SystemModule>,
  ) {}

  async findAll() {
    return this.tenantsRepo.find({
      relations: ['plan', 'modules'],
      order: { createdAt: 'DESC' },
    });
  }

  async findOne(id: string) {
    const tenant = await this.tenantsRepo.findOne({
      where: { id },
      relations: ['plan', 'modules', 'users'],
    });
    if (!tenant) throw new NotFoundException('Tenant não encontrado');
    return tenant;
  }

  async create(dto: CreateTenantDto) {
    const existing = await this.tenantsRepo.findOne({
      where: { slug: dto.slug },
    });
    if (existing) throw new ConflictException('Slug já em uso');

    const tenant = this.tenantsRepo.create(dto);
    const saved = await this.tenantsRepo.save(tenant);

    await this.activateCoreModules(saved.id);

    return this.findOne(saved.id);
  }

  async update(id: string, dto: UpdateTenantDto) {
    const tenant = await this.findOne(id);

    if (dto.slug && dto.slug !== tenant.slug) {
      const existing = await this.tenantsRepo.findOne({
        where: { slug: dto.slug },
      });
      if (existing) throw new ConflictException('Slug já em uso');
    }

    Object.assign(tenant, dto);
    return this.tenantsRepo.save(tenant);
  }

  async remove(id: string) {
    const tenant = await this.findOne(id);
    return this.tenantsRepo.remove(tenant);
  }

  private async activateCoreModules(tenantId: string) {
    const coreModules = await this.systemModuleRepo.find({
      where: { isCore: true },
    });

    const tenantModules = coreModules.map((mod) =>
      this.tenantModuleRepo.create({
        tenantId,
        moduleKey: mod.key,
        enabled: true,
      }),
    );

    await this.tenantModuleRepo.save(tenantModules);
  }
}
