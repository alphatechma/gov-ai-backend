import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AmendmentsService } from './amendments.service';
import { AmendmentsController } from './amendments.controller';
import { Amendment } from './amendment.entity';
import { TenantModule } from '../../core/modules/tenant-module.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Amendment, TenantModule])],
  controllers: [AmendmentsController],
  providers: [AmendmentsService],
  exports: [AmendmentsService],
})
export class AmendmentsModule {}
