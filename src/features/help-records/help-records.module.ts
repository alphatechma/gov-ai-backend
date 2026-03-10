import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HelpRecordsService } from './help-records.service';
import { HelpRecordsController } from './help-records.controller';
import { HelpRecord } from './help-record.entity';
import { HelpType } from './help-type.entity';
import { TenantModule } from '../../core/modules/tenant-module.entity';

@Module({
  imports: [TypeOrmModule.forFeature([HelpRecord, HelpType, TenantModule])],
  controllers: [HelpRecordsController],
  providers: [HelpRecordsService],
  exports: [HelpRecordsService],
})
export class HelpRecordsModule {}
