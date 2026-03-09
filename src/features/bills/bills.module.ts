import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BillsService } from './bills.service';
import { BillsController } from './bills.controller';
import { LegislativeBill } from './bill.entity';
import { TenantModule } from '../../core/modules/tenant-module.entity';

@Module({
  imports: [TypeOrmModule.forFeature([LegislativeBill, TenantModule])],
  controllers: [BillsController],
  providers: [BillsService],
  exports: [BillsService],
})
export class BillsModule {}
