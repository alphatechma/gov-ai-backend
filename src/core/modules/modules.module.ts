import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ModulesService } from './modules.service';
import { ModulesController } from './modules.controller';
import { SystemModule } from './system-module.entity';
import { TenantModule } from './tenant-module.entity';
import { Tenant } from '../tenants/tenant.entity';

@Module({
  imports: [TypeOrmModule.forFeature([SystemModule, TenantModule, Tenant])],
  controllers: [ModulesController],
  providers: [ModulesService],
  exports: [ModulesService, TypeOrmModule.forFeature([TenantModule])],
})
export class ModulesModule {}
