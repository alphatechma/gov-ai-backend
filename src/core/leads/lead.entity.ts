import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { LeadFunnelStatus } from '../../shared/enums';
import { Plan } from '../plans/plan.entity';

@Entity('leads')
export class Lead {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column()
  email: string;

  @Column()
  phone: string;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @Column({ type: 'varchar', nullable: true })
  source: string | null;

  @Column({
    type: 'enum',
    enum: LeadFunnelStatus,
    default: LeadFunnelStatus.NOVO,
  })
  funnelStatus: LeadFunnelStatus;

  @Column({ type: 'timestamp', nullable: true })
  lastInteraction: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  nextInteraction: Date | null;

  @Column({ type: 'int', default: 0 })
  contactAttempts: number;

  @Column({ type: 'uuid', nullable: true })
  planId: string | null;

  @ManyToOne(() => Plan, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'planId' })
  plan: Plan | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
