import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('election_results')
export class ElectionResult {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  tenantId: string;

  @Column({ type: 'int' })
  electionYear: number;

  @Column({ type: 'int', default: 1 })
  round: number;

  @Column()
  candidateName: string;

  @Column({ nullable: true })
  candidateNumber: string;

  @Column({ nullable: true })
  candidateParty: string;

  @Column({ type: 'boolean', default: false })
  isTenantCandidate: boolean;

  @Column({ nullable: true })
  zone: string;

  @Column({ nullable: true })
  section: string;

  @Column({ nullable: true })
  city: string;

  @Column({ nullable: true })
  state: string;

  @Column({ nullable: true })
  neighborhood: string;

  @Column({ type: 'int', default: 0 })
  candidateVotes: number;

  @Column({ type: 'int', default: 0 })
  totalVotes: number;

  @Column({ nullable: true })
  party: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
