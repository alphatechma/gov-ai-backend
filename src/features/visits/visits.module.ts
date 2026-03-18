import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { VisitsService } from './visits.service';
import { VisitsController } from './visits.controller';
import { Visit } from './visit.entity';
import { TenantModule } from '../../core/modules/tenant-module.entity';
import { Appointment } from '../appointments/appointment.entity';
import { Voter } from '../voters/voter.entity';
import { Leader } from '../leaders/leader.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Visit, TenantModule, Appointment, Voter, Leader])],
  controllers: [VisitsController],
  providers: [VisitsService],
  exports: [VisitsService],
})
export class VisitsModule {}
