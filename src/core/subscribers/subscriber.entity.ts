import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Lead } from '../leads/lead.entity';
import { Plan } from '../plans/plan.entity';

@Entity('subscribers')
export class Subscriber {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  leadId: string;

  @ManyToOne(() => Lead, { onDelete: 'RESTRICT', eager: false })
  @JoinColumn({ name: 'leadId' })
  lead: Lead;

  @Column({ type: 'uuid' })
  planId: string;

  @ManyToOne(() => Plan, { onDelete: 'RESTRICT', eager: false })
  @JoinColumn({ name: 'planId' })
  plan: Plan;

  @Column({ type: 'boolean', default: true })
  active: boolean;

  @Column({ type: 'timestamp' })
  startDate: Date;

  @Column({ type: 'timestamp', nullable: true })
  endDate: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
