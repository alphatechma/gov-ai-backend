import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DeepPartial } from 'typeorm';
import { Visit } from './visit.entity';
import { Appointment } from '../appointments/appointment.entity';
import { Voter } from '../voters/voter.entity';
import { Leader } from '../leaders/leader.entity';
import { TenantAwareService } from '../../shared/base/tenant-aware.service';
import { VisitStatus, AppointmentType, AppointmentStatus } from '../../shared/enums/features';

const visitStatusToAppointmentStatus: Record<VisitStatus, AppointmentStatus> = {
  [VisitStatus.AGENDADA]: AppointmentStatus.SCHEDULED,
  [VisitStatus.EM_ATENDIMENTO]: AppointmentStatus.IN_PROGRESS,
  [VisitStatus.CONCLUIDA]: AppointmentStatus.COMPLETED,
  [VisitStatus.CANCELADA]: AppointmentStatus.CANCELLED,
};

@Injectable()
export class VisitsService extends TenantAwareService<Visit> {
  constructor(
    @InjectRepository(Visit) repo: Repository<Visit>,
    @InjectRepository(Appointment)
    private appointmentRepo: Repository<Appointment>,
    @InjectRepository(Voter)
    private voterRepo: Repository<Voter>,
    @InjectRepository(Leader)
    private leaderRepo: Repository<Leader>,
  ) {
    super(repo);
  }

  async getVotersForSelect(tenantId: string) {
    return this.voterRepo.find({
      where: { tenantId },
      select: { id: true, name: true, leaderId: true },
      order: { name: 'ASC' },
    });
  }

  async getLeadersForSelect(tenantId: string) {
    return this.leaderRepo.find({
      where: { tenantId, active: true },
      select: { id: true, name: true },
      order: { name: 'ASC' },
    });
  }

  async createLeader(tenantId: string, name: string) {
    const leader = this.leaderRepo.create({ tenantId, name, active: true });
    return this.leaderRepo.save(leader);
  }

  async create(tenantId: string, dto: DeepPartial<Visit>) {
    const visit = this.repository.create({
      ...dto,
      tenantId,
      status: (dto as any).status || VisitStatus.AGENDADA,
    } as DeepPartial<Visit>);

    const saved = await this.repository.save(visit);

    let personName = saved.visitorName || 'Cidadão';
    if (saved.voterId) {
      const voter = await this.voterRepo.findOne({
        where: { id: saved.voterId, tenantId },
      });
      if (voter) personName = voter.name;
    }

    const appointmentData = {
      tenantId,
      title: `Visita - ${personName}`,
      description: saved.objective || null,
      type: AppointmentType.VISITA,
      status: visitStatusToAppointmentStatus[saved.status] || AppointmentStatus.SCHEDULED,
      startDate: saved.date,
      voterId: saved.voterId || null,
      leaderId: saved.leaderId || null,
    } as Partial<Appointment>;

    const appointment = this.appointmentRepo.create(appointmentData);
    const savedAppointment = await this.appointmentRepo.save(appointment);

    saved.appointmentId = savedAppointment.id;
    return this.repository.save(saved);
  }

  async update(tenantId: string, id: string, dto: DeepPartial<Visit>) {
    const visit = await this.findOne(tenantId, id);
    Object.assign(visit, dto);
    const saved = await this.repository.save(visit);

    if (saved.appointmentId) {
      const appointment = await this.appointmentRepo.findOne({
        where: { id: saved.appointmentId },
      });

      if (appointment) {
        if (dto.date !== undefined) appointment.startDate = saved.date;
        if ((dto as any).objective !== undefined) appointment.description = saved.objective;
        if ((dto as any).status !== undefined) {
          appointment.status =
            visitStatusToAppointmentStatus[saved.status] || appointment.status;
        }
        if (dto.voterId !== undefined) appointment.voterId = saved.voterId;
        if (dto.leaderId !== undefined) appointment.leaderId = saved.leaderId;

        if (dto.voterId !== undefined || (dto as any).visitorName !== undefined) {
          let personName = saved.visitorName || 'Cidadão';
          if (saved.voterId) {
            const voter = await this.voterRepo.findOne({
              where: { id: saved.voterId, tenantId },
            });
            if (voter) personName = voter.name;
          }
          appointment.title = `Visita - ${personName}`;
        }

        await this.appointmentRepo.save(appointment);
      }
    }

    return saved;
  }

  async remove(tenantId: string, id: string) {
    const visit = await this.findOne(tenantId, id);
    const appointmentId = visit.appointmentId;

    const removed = await this.repository.remove(visit);

    if (appointmentId) {
      const appointment = await this.appointmentRepo.findOne({
        where: { id: appointmentId },
      });
      if (appointment) {
        await this.appointmentRepo.remove(appointment);
      }
    }

    return removed;
  }
}
