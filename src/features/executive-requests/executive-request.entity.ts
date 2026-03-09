import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { RequestType, RequestStatus } from '../../shared/enums/features';

@Entity('executive_requests')
export class ExecutiveRequest {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  tenantId: string;

  @Column({ nullable: true })
  protocolNumber: string;

  @Column({ type: 'enum', enum: RequestType })
  type: RequestType;

  @Column({
    type: 'enum',
    enum: RequestStatus,
    default: RequestStatus.ENVIADO,
  })
  status: RequestStatus;

  @Column()
  subject: string;

  @Column({ type: 'text' })
  description: string;

  @Column({ type: 'text', nullable: true })
  response: string;

  @Column({ nullable: true })
  recipientOrgan: string;

  @Column({ type: 'date', nullable: true })
  deadline: Date;

  @Column({ type: 'jsonb', default: [] })
  documents: string[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
