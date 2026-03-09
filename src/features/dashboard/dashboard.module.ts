import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DashboardService } from './dashboard.service';
import { DashboardController } from './dashboard.controller';
import { TenantModule } from '../../core/modules/tenant-module.entity';
import { ModulesModule } from '../../core/modules/modules.module';

@Module({
  imports: [TypeOrmModule.forFeature([TenantModule]), ModulesModule],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
