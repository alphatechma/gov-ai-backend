import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { VisitStatus } from '../../shared/enums/features';
import { Appointment } from '../appointments/appointment.entity';

@Entity('visits')
export class Visit {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  tenantId: string;

  @Column({ nullable: true })
  voterId: string;

  @Column({ nullable: true })
  leaderId: string;

  @Column({ nullable: true })
  userId: string;

  @Column({ nullable: true })
  visitorName: string;

  @Column({ type: 'timestamp' })
  date: Date;

  @Column({ type: 'text', nullable: true })
  visitorAddress: string;

  @Column({ nullable: true })
  areaType: string;

  @Column({ nullable: true })
  district: string;

  @Column({ nullable: true })
  neighborhood: string;

  @Column({ nullable: true })
  requestType: string;

  @Column({ type: 'text', nullable: true })
  requestTypeOther: string;

  @Column({ type: 'text', nullable: true })
  objective: string;

  @Column({ type: 'text', nullable: true })
  result: string;

  @Column({
    type: 'enum',
    enum: VisitStatus,
    default: VisitStatus.AGENDADA,
  })
  status: VisitStatus;

  @Column({ nullable: true })
  appointmentId: string;

  @ManyToOne(() => Appointment, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'appointmentId' })
  appointment: Appointment;

  @Column({ type: 'text', nullable: true })
  requestDescription: string;

  @Column({ type: 'jsonb', default: [] })
  photos: string[];

  @Column({ type: 'decimal', precision: 10, scale: 7, nullable: true })
  latitude: number;

  @Column({ type: 'decimal', precision: 10, scale: 7, nullable: true })
  longitude: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
