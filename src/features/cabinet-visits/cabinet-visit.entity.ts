import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Visitor } from './visitor.entity';

@Entity('cabinet_visits')
export class CabinetVisit {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  tenantId: string;

  @Column({ nullable: true })
  visitorId: string;

  @ManyToOne(() => Visitor, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'visitorId' })
  visitor: Visitor;

  @Column({ nullable: true })
  voterId: string;

  @Column({ nullable: true })
  helpRecordId: string;

  @Column({ nullable: true })
  purpose: string;

  @Column({ nullable: true })
  attendedBy: string;

  @Column({ type: 'timestamp' })
  checkInAt: Date;

  @Column({ type: 'text', nullable: true })
  observations: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
