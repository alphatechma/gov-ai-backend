import {
  Injectable,
  Logger,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Tenant } from './tenant.entity';
import { CreateTenantDto } from './dto/create-tenant.dto';
import { UpdateTenantDto } from './dto/update-tenant.dto';
import { TenantModule } from '../modules/tenant-module.entity';
import { SystemModule } from '../modules/system-module.entity';
import { Plan } from '../plans/plan.entity';

/**
 * Maps each module key to the database tables that should be cleared.
 * Order matters: child tables (with FK references) must come before parent tables.
 */
const MODULE_TABLES: Record<string, string[]> = {
  voters: ['voters'],
  leaders: ['leaders'],
  visits: ['visits'],
  'help-records': ['help_records', 'help_types'],
  tasks: ['tasks'],
  agenda: ['appointments'],
  staff: ['staff_members'],
  projects: ['law_projects'],
  bills: ['legislative_bills'],
  amendments: ['amendments'],
  'voting-records': ['voting_records'],
  'political-contacts': ['political_contacts'],
  ceap: ['ceap_expenses'],
  'executive-requests': ['executive_requests'],
  chat: ['chat_conversations'],
  whatsapp: ['whatsapp_messages', 'whatsapp_connections'],
};

@Injectable()
export class TenantsService {
  private readonly logger = new Logger(TenantsService.name);

  constructor(
    @InjectRepository(Tenant)
    private tenantsRepo: Repository<Tenant>,
    @InjectRepository(TenantModule)
    private tenantModuleRepo: Repository<TenantModule>,
    @InjectRepository(SystemModule)
    private systemModuleRepo: Repository<SystemModule>,
    @InjectRepository(Plan)
    private plansRepo: Repository<Plan>,
    private dataSource: DataSource,
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

  async deleteModuleData(
    tenantId: string,
    moduleKey: string,
  ): Promise<{ deleted: Record<string, number> }> {
    await this.findOne(tenantId); // ensure tenant exists

    const tables = MODULE_TABLES[moduleKey];
    if (!tables) {
      throw new BadRequestException(
        `Módulo "${moduleKey}" não possui dados para limpar`,
      );
    }

    const deleted: Record<string, number> = {};

    await this.dataSource.transaction(async (manager) => {
      for (const table of tables) {
        const result = await manager.query(
          `DELETE FROM "${table}" WHERE "tenantId" = $1`,
          [tenantId],
        );
        deleted[table] = result[1] ?? 0;
      }
    });

    return { deleted };
  }

  async getModuleDataCounts(tenantId: string): Promise<Record<string, number>> {
    await this.findOne(tenantId);

    const counts: Record<string, number> = {};

    for (const [moduleKey, tables] of Object.entries(MODULE_TABLES)) {
      let total = 0;
      for (const table of tables) {
        try {
          const result = await this.dataSource.query(
            `SELECT COUNT(*)::int AS count FROM "${table}" WHERE "tenantId" = $1`,
            [tenantId],
          );
          total += result[0]?.count ?? 0;
        } catch {
          // Table may not exist yet (no migration run)
        }
      }
      counts[moduleKey] = total;
    }

    return counts;
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

  async activatePlanModules(tenantId: string, planId: string): Promise<void> {
    const plan = await this.plansRepo.findOne({ where: { id: planId } });
    const rawModules = Array.isArray(plan?.modules)
      ? plan!.modules
      : typeof plan?.modules === 'string'
        ? this.parseJsonArray(plan.modules)
        : [];

    if (!plan || rawModules.length === 0) {
      this.logger.warn(
        `activatePlanModules: plano ${planId} sem módulos para ativar`,
      );
      return;
    }

    const allModules = await this.systemModuleRepo.find();
    const byKey = new Set(allModules.map((m) => m.key));
    const byName = new Map(allModules.map((m) => [m.name, m.key]));

    const resolvedKeys: string[] = [];
    const unknown: string[] = [];

    for (const entry of rawModules) {
      if (typeof entry !== 'string' || !entry.trim()) continue;
      const value = entry.trim();
      if (byKey.has(value)) {
        resolvedKeys.push(value);
      } else if (byName.has(value)) {
        resolvedKeys.push(byName.get(value)!);
      } else {
        unknown.push(value);
      }
    }

    if (unknown.length) {
      this.logger.warn(
        `activatePlanModules: plano ${planId} referencia módulos desconhecidos (ignorados): ${unknown.join(', ')}`,
      );
    }

    if (resolvedKeys.length === 0) {
      this.logger.warn(
        `activatePlanModules: plano ${planId} não tem nenhum módulo válido após normalização`,
      );
      return;
    }

    await this.tenantModuleRepo
      .createQueryBuilder()
      .insert()
      .into(TenantModule)
      .values(
        resolvedKeys.map((moduleKey) => ({
          tenantId,
          moduleKey,
          enabled: true,
        })),
      )
      .orIgnore()
      .execute();

    this.logger.log(
      `activatePlanModules: tenant ${tenantId} ganhou ${resolvedKeys.length} módulo(s) do plano: ${resolvedKeys.join(', ')}`,
    );
  }

  private parseJsonArray(value: string): unknown[] {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
}
