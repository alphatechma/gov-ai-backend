import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TenantsService } from './tenants.service';
import { TenantsController } from './tenants.controller';
import { TenantBrandingController } from './tenant-branding.controller';
import { TenantBrandingService } from './tenant-branding.service';
import { Tenant } from './tenant.entity';
import { TenantModule } from '../modules/tenant-module.entity';
import { SystemModule } from '../modules/system-module.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Tenant, TenantModule, SystemModule])],
  controllers: [TenantsController, TenantBrandingController],
  providers: [TenantsService, TenantBrandingService],
  exports: [TenantsService],
})
export class TenantsModule {}
