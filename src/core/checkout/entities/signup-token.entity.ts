import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { CheckoutSession } from './checkout-session.entity';
import { Tenant } from '../../tenants/tenant.entity';

export type SignupStep = 'TENANT' | 'USER' | 'COMPLETED';

@Entity('signup_tokens')
export class SignupToken {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  @Index({ unique: true })
  checkoutSessionId: string;

  @ManyToOne(() => CheckoutSession, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'checkoutSessionId' })
  checkoutSession: CheckoutSession;

  @Column({ type: 'varchar', length: 64 })
  @Index({ unique: true })
  tokenHash: string;

  @Column({ type: 'varchar', length: 16, default: 'TENANT' })
  currentStep: SignupStep;

  @Column({ type: 'uuid', nullable: true })
  @Index()
  tenantId: string | null;

  @ManyToOne(() => Tenant, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'tenantId' })
  tenant: Tenant | null;

  @Column({ type: 'timestamp' })
  expiresAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  usedAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;
}
