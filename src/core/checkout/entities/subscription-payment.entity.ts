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

const decimalTransformer = {
  to: (value: number | null | undefined) => value,
  from: (value: string | null) => (value === null ? 0 : parseFloat(value)),
};

@Entity('subscription_payments')
export class SubscriptionPayment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  @Index()
  checkoutSessionId: string;

  @ManyToOne(() => CheckoutSession, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'checkoutSessionId' })
  checkoutSession: CheckoutSession;

  @Column({ type: 'varchar' })
  @Index({ unique: true })
  mpPaymentId: string;

  @Column({
    type: 'decimal',
    precision: 10,
    scale: 2,
    transformer: decimalTransformer,
  })
  amount: number;

  @Column({ type: 'varchar' })
  mpStatus: string;

  @Column({ type: 'timestamp', nullable: true })
  paidAt: Date | null;

  @Column({ type: 'jsonb', nullable: true })
  rawPayload: Record<string, unknown> | null;

  @CreateDateColumn()
  createdAt: Date;
}
