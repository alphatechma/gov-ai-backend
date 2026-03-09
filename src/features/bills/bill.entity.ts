import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import {
  BillType,
  BillStatus,
  BillAuthorship,
} from '../../shared/enums/features';

@Entity('legislative_bills')
export class LegislativeBill {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  tenantId: string;

  @Column({ nullable: true })
  number: string;

  @Column()
  title: string;

  @Column({ type: 'text', nullable: true })
  summary: string;

  @Column({ type: 'enum', enum: BillType })
  type: BillType;

  @Column({
    type: 'enum',
    enum: BillStatus,
    default: BillStatus.EM_TRAMITACAO,
  })
  status: BillStatus;

  @Column({
    type: 'enum',
    enum: BillAuthorship,
    default: BillAuthorship.ACOMPANHAMENTO,
  })
  authorship: BillAuthorship;

  @Column({ nullable: true })
  committee: string;

  @Column({ nullable: true })
  documentUrl: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
