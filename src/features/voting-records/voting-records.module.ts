import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { VotingRecordsService } from './voting-records.service';
import { VotingRecordsController } from './voting-records.controller';
import { VotingRecord } from './voting-record.entity';
import { TenantModule } from '../../core/modules/tenant-module.entity';

@Module({
  imports: [TypeOrmModule.forFeature([VotingRecord, TenantModule])],
  controllers: [VotingRecordsController],
  providers: [VotingRecordsService],
  exports: [VotingRecordsService],
})
export class VotingRecordsModule {}
