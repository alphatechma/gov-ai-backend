import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Appointment } from './appointment.entity';
import { TenantAwareService } from '../../shared/base/tenant-aware.service';

@Injectable()
export class AppointmentsService extends TenantAwareService<Appointment> {
  constructor(@InjectRepository(Appointment) repo: Repository<Appointment>) {
    super(repo);
  }
}
