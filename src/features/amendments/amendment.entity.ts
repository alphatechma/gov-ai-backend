import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { AmendmentStatus } from '../../shared/enums/features';

@Entity('amendments')
export class Amendment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  tenantId: string;

  @Column({ nullable: true })
  code: string;

  @Column()
  description: string;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  value: number;

  @Column({
    type: 'enum',
    enum: AmendmentStatus,
    default: AmendmentStatus.APROVADA,
  })
  status: AmendmentStatus;

  @Column({ type: 'int', default: 0 })
  executionPercentage: number;

  @Column({ nullable: true })
  beneficiary: string;

  @Column({ nullable: true })
  city: string;

  @Column({ type: 'jsonb', default: [] })
  documents: string[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
