import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import {
  BillingCycle,
  CheckoutStatus,
  MpResourceType,
} from '../../../shared/enums';
import { Lead } from '../../leads/lead.entity';
import { Plan } from '../../plans/plan.entity';

const decimalTransformer = {
  to: (value: number | null | undefined) => value,
  from: (value: string | null) => (value === null ? null : parseFloat(value)),
};

@Entity('checkout_sessions')
export class CheckoutSession {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  @Index()
  leadId: string;

  @ManyToOne(() => Lead, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'leadId' })
  lead: Lead;

  @Column({ type: 'uuid' })
  @Index()
  planId: string;

  @ManyToOne(() => Plan, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'planId' })
  plan: Plan;

  @Column({ type: 'enum', enum: BillingCycle })
  billingCycle: BillingCycle;

  @Column({ type: 'enum', enum: MpResourceType })
  mpResourceType: MpResourceType;

  @Column({ type: 'varchar' })
  @Index({ unique: true })
  mpResourceId: string;

  @Column({ type: 'varchar', nullable: true })
  @Index()
  mpPaymentId: string | null;

  @Column({ type: 'varchar' })
  mpExternalReference: string;

  @Column({
    type: 'decimal',
    precision: 10,
    scale: 2,
    transformer: decimalTransformer,
  })
  adhesionAmount: number;

  @Column({
    type: 'decimal',
    precision: 10,
    scale: 2,
    transformer: decimalTransformer,
  })
  planAmount: number;

  @Column({
    type: 'decimal',
    precision: 10,
    scale: 2,
    transformer: decimalTransformer,
  })
  firstChargeAmount: number;

  @Column({
    type: 'decimal',
    precision: 10,
    scale: 2,
    nullable: true,
    transformer: decimalTransformer,
  })
  recurringAmount: number | null;

  @Column({
    type: 'enum',
    enum: CheckoutStatus,
    default: CheckoutStatus.PENDING,
  })
  @Index()
  status: CheckoutStatus;

  @Column({ type: 'varchar', nullable: true })
  mpStatus: string | null;

  @Column({ type: 'boolean', default: false })
  adhesionAdjusted: boolean;

  @Column({ type: 'varchar' })
  initPoint: string;

  @Column({ type: 'timestamp', nullable: true })
  paidAt: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  cancelledAt: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  lastFailedChargeAt: Date | null;

  @Column({ type: 'int', default: 0 })
  failedChargesCount: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
