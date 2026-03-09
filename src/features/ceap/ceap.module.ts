import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CeapService } from './ceap.service';
import { CeapController } from './ceap.controller';
import { CeapExpense } from './ceap-expense.entity';
import { TenantModule } from '../../core/modules/tenant-module.entity';

@Module({
  imports: [TypeOrmModule.forFeature([CeapExpense, TenantModule])],
  controllers: [CeapController],
  providers: [CeapService],
  exports: [CeapService],
})
export class CeapModule {}
