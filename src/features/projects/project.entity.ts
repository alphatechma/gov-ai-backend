import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { ProjectStatus } from '../../shared/enums/features';

@Entity('law_projects')
export class LawProject {
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

  @Column({
    type: 'enum',
    enum: ProjectStatus,
    default: ProjectStatus.EM_ELABORACAO,
  })
  status: ProjectStatus;

  @Column({ type: 'jsonb', default: [] })
  timeline: any[];

  @Column({ type: 'int', default: 0 })
  votesFor: number;

  @Column({ type: 'int', default: 0 })
  votesAgainst: number;

  @Column({ nullable: true })
  pdfUrl: string;

  @Column({ type: 'int', default: 0 })
  views: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
