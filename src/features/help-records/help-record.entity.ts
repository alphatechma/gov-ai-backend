import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { HelpStatus } from '../../shared/enums/features';

@Entity('help_records')
export class HelpRecord {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  tenantId: string;

  @Column({ nullable: true })
  voterId: string;

  @Column({ nullable: true })
  type: string;

  @Column({ nullable: true })
  category: string;

  @Column({ type: 'enum', enum: HelpStatus, default: HelpStatus.PENDING })
  status: HelpStatus;

  @Column({ type: 'text', nullable: true })
  observations: string;

  @Column({ type: 'text', nullable: true })
  resolution: string;

  @Column({ nullable: true })
  responsibleId: string;

  @Column({ nullable: true })
  leaderId: string;

  @Column({ type: 'date', nullable: true })
  date: string;

  @Column({ type: 'jsonb', default: [] })
  documents: string[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
