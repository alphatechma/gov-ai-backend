import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { VisitsService } from './visits.service';
import { VisitsController } from './visits.controller';
import { Visit } from './visit.entity';
import { TenantModule } from '../../core/modules/tenant-module.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Visit, TenantModule])],
  controllers: [VisitsController],
  providers: [VisitsService],
  exports: [VisitsService],
})
export class VisitsModule {}
