import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SystemModule } from './system-module.entity';
import { TenantModule } from './tenant-module.entity';
import { ToggleModuleDto } from './dto/toggle-module.dto';
import { Tenant } from '../tenants/tenant.entity';

@Injectable()
export class ModulesService {
  constructor(
    @InjectRepository(SystemModule)
    private systemModuleRepo: Repository<SystemModule>,
    @InjectRepository(TenantModule)
    private tenantModuleRepo: Repository<TenantModule>,
    @InjectRepository(Tenant)
    private tenantsRepo: Repository<Tenant>,
  ) {}

  findAllSystemModules() {
    return this.systemModuleRepo.find({ order: { category: 'ASC', name: 'ASC' } });
  }

  async findTenantModules(tenantId: string) {
    return this.tenantModuleRepo.find({
      where: { tenantId },
      order: { moduleKey: 'ASC' },
    });
  }

  async toggleModule(tenantId: string, dto: ToggleModuleDto, userId: string) {
    const tenant = await this.tenantsRepo.findOne({ where: { id: tenantId } });
    if (!tenant) throw new NotFoundException('Tenant não encontrado');

    const systemModule = await this.systemModuleRepo.findOne({
      where: { key: dto.moduleKey },
    });
    if (!systemModule) {
      throw new NotFoundException(`Módulo "${dto.moduleKey}" não existe`);
    }

    if (systemModule.isCore && !dto.enabled) {
      throw new BadRequestException('Módulos core não podem ser desativados');
    }

    if (
      systemModule.availableFor.length > 0 &&
      !systemModule.availableFor.includes(tenant.politicalProfile)
    ) {
      throw new BadRequestException(
        `Módulo "${dto.moduleKey}" não está disponível para o perfil ${tenant.politicalProfile}`,
      );
    }

    let tenantModule = await this.tenantModuleRepo.findOne({
      where: { tenantId, moduleKey: dto.moduleKey },
    });

    if (tenantModule) {
      tenantModule.enabled = dto.enabled;
      tenantModule.config = dto.config ?? tenantModule.config;
      if (dto.enabled) {
        tenantModule.activatedAt = new Date();
        tenantModule.activatedBy = userId;
      }
    } else {
      tenantModule = this.tenantModuleRepo.create({
        tenantId,
        moduleKey: dto.moduleKey,
        enabled: dto.enabled,
        activatedBy: userId,
        config: dto.config,
      });
    }

    return this.tenantModuleRepo.save(tenantModule);
  }

  async getAvailableModulesForTenant(tenantId: string) {
    const tenant = await this.tenantsRepo.findOne({ where: { id: tenantId } });
    if (!tenant) throw new NotFoundException('Tenant não encontrado');

    const allModules = await this.systemModuleRepo.find();
    const tenantModules = await this.tenantModuleRepo.find({
      where: { tenantId },
    });

    const enabledKeys = new Set(
      tenantModules.filter((m) => m.enabled).map((m) => m.moduleKey),
    );

    return allModules
      .filter(
        (m) =>
          m.availableFor.length === 0 ||
          m.availableFor.includes(tenant.politicalProfile),
      )
      .map((m) => ({
        ...m,
        enabled: enabledKeys.has(m.key),
      }));
  }
}
