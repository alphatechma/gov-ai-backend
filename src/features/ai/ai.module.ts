import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AiService } from './ai.service';
import { AiController } from './ai.controller';
import { TenantModule } from '../../core/modules/tenant-module.entity';
import { Voter } from '../voters/voter.entity';
import { Leader } from '../leaders/leader.entity';
import { Visit } from '../visits/visit.entity';
import { HelpRecord } from '../help-records/help-record.entity';
import { Task } from '../tasks/task.entity';
import { PoliticalContact } from '../political-contacts/political-contact.entity';
import { Appointment } from '../appointments/appointment.entity';
import { StaffMember } from '../staff/staff.entity';
import { LawProject } from '../projects/project.entity';
import { LegislativeBill } from '../bills/bill.entity';
import { Amendment } from '../amendments/amendment.entity';
import { VotingRecord } from '../voting-records/voting-record.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      TenantModule,
      Voter,
      Leader,
      Visit,
      HelpRecord,
      Task,
      PoliticalContact,
      Appointment,
      StaffMember,
      LawProject,
      LegislativeBill,
      Amendment,
      VotingRecord,
    ]),
  ],
  controllers: [AiController],
  providers: [AiService],
  exports: [AiService],
})
export class AiModule {}
