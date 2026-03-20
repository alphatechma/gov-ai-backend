import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CabinetVisitsService } from './cabinet-visits.service';
import { CabinetVisitsController } from './cabinet-visits.controller';
import { CabinetVisit } from './cabinet-visit.entity';
import { Visitor } from './visitor.entity';
import { HelpRecord } from '../help-records/help-record.entity';
import { HelpType } from '../help-records/help-type.entity';
import { Voter } from '../voters/voter.entity';
import { TenantModule } from '../../core/modules/tenant-module.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      CabinetVisit,
      Visitor,
      HelpRecord,
      HelpType,
      Voter,
      TenantModule,
    ]),
  ],
  controllers: [CabinetVisitsController],
  providers: [CabinetVisitsService],
  exports: [CabinetVisitsService],
})
export class CabinetVisitsModule {}
