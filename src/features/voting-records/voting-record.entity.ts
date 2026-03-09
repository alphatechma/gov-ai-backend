import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { VoteChoice, VoteResult } from '../../shared/enums/features';

@Entity('voting_records')
export class VotingRecord {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  tenantId: string;

  @Column({ nullable: true })
  session: string;

  @Column()
  subject: string;

  @Column({ type: 'timestamp' })
  date: Date;

  @Column({ type: 'enum', enum: VoteChoice })
  vote: VoteChoice;

  @Column({ type: 'enum', enum: VoteResult, nullable: true })
  result: VoteResult;

  @Column({ nullable: true })
  billId: string;

  @Column({ type: 'text', nullable: true })
  notes: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
