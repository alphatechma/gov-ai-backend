import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  OneToMany,
} from 'typeorm';
import { SupportLevel, ConfidenceLevel } from '../../shared/enums/features';

@Entity('voters')
export class Voter {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  tenantId: string;

  @Column()
  name: string;

  @Column({ nullable: true })
  cpf: string;

  @Column({ nullable: true })
  phone: string;

  @Column({ nullable: true })
  email: string;

  @Column({ type: 'date', nullable: true })
  birthDate: Date;

  @Column({ nullable: true })
  gender: string;

  @Column({ nullable: true })
  address: string;

  @Column({ nullable: true })
  neighborhood: string;

  @Column({ nullable: true })
  city: string;

  @Column({ nullable: true })
  state: string;

  @Column({ nullable: true })
  zipCode: string;

  @Column({ type: 'decimal', precision: 10, scale: 7, nullable: true })
  latitude: number;

  @Column({ type: 'decimal', precision: 10, scale: 7, nullable: true })
  longitude: number;

  @Column({ nullable: true })
  voterRegistration: string;

  @Column({ nullable: true })
  votingZone: string;

  @Column({ nullable: true })
  votingSection: string;

  @Column({ nullable: true })
  leaderId: string;

  @Column({
    type: 'enum',
    enum: SupportLevel,
    default: SupportLevel.INDEFINIDO,
  })
  supportLevel: SupportLevel;

  @Column({
    type: 'enum',
    enum: ConfidenceLevel,
    default: ConfidenceLevel.NEUTRO,
  })
  confidenceLevel: ConfidenceLevel;

  @Column({ type: 'jsonb', default: [] })
  tags: string[];

  @Column({ type: 'text', nullable: true })
  notes: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
