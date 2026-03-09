import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { HelpCategory, HelpStatus } from '../../shared/enums/features';

@Entity('help_records')
export class HelpRecord {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  tenantId: string;

  @Column({ nullable: true })
  voterId: string;

  @Column({ type: 'enum', enum: HelpCategory })
  category: HelpCategory;

  @Column({ type: 'enum', enum: HelpStatus, default: HelpStatus.PENDING })
  status: HelpStatus;

  @Column({ type: 'text' })
  description: string;

  @Column({ type: 'text', nullable: true })
  resolution: string;

  @Column({ nullable: true })
  responsibleId: string;

  @Column({ type: 'jsonb', default: [] })
  documents: string[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
