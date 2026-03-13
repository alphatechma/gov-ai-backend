import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import {
  ExpenseCategory,
  TransactionType,
  TransactionStatus,
} from '../../shared/enums/features';

@Entity('ceap_expenses')
export class CeapExpense {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  tenantId: string;

  @Column({
    type: 'enum',
    enum: TransactionType,
    default: TransactionType.DESPESA,
  })
  type: TransactionType;

  @Column({
    type: 'enum',
    enum: TransactionStatus,
    default: TransactionStatus.PENDENTE,
  })
  status: TransactionStatus;

  @Column()
  description: string;

  @Column({ type: 'enum', enum: ExpenseCategory })
  category: ExpenseCategory;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  value: number;

  @Column({ type: 'date' })
  date: Date;

  @Column({ nullable: true })
  supplier: string;

  @Column({ nullable: true })
  supplierCnpj: string;

  @Column({ nullable: true })
  receiptUrl: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
