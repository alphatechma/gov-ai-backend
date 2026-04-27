import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { Lead } from '../leads/lead.entity';
import { Plan } from '../plans/plan.entity';
import { User } from '../users/user.entity';
import { CheckoutSession } from '../checkout/entities/checkout-session.entity';

@Entity('subscribers')
export class Subscriber {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  leadId: string;

  @ManyToOne(() => Lead, { onDelete: 'RESTRICT', eager: false })
  @JoinColumn({ name: 'leadId' })
  lead: Lead;

  @Column({ type: 'uuid', nullable: true })
  @Index({ unique: true, where: '"userId" IS NOT NULL' })
  userId: string | null;

  @ManyToOne(() => User, { onDelete: 'SET NULL', eager: false, nullable: true })
  @JoinColumn({ name: 'userId' })
  user: User | null;

  @Column({ type: 'uuid', nullable: true })
  @Index({ unique: true, where: '"checkoutSessionId" IS NOT NULL' })
  checkoutSessionId: string | null;

  @ManyToOne(() => CheckoutSession, {
    onDelete: 'SET NULL',
    eager: false,
    nullable: true,
  })
  @JoinColumn({ name: 'checkoutSessionId' })
  checkoutSession: CheckoutSession | null;

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

  @Column({ type: 'timestamp', nullable: true })
  trialEndsAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
