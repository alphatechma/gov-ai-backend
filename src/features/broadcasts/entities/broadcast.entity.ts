import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

export enum BroadcastStatus {
  ACTIVE = 'ACTIVE',
  PAUSED = 'PAUSED',
  FINISHED = 'FINISHED',
}

@Entity('broadcasts')
@Index(['tenantId'])
export class Broadcast {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  tenantId: string;

  @Column()
  title: string;

  @Column({ nullable: true, type: 'text' })
  description: string;

  /** Mensagens enviadas */
  @Column({ default: 0 })
  sent: number;

  /** Mensagens com falha */
  @Column({ default: 0 })
  failed: number;

  /** Mensagens pendentes */
  @Column({ default: 0 })
  pending: number;

  /** Velocidade de envio — ex: "0.1 msg/min" */
  @Column({ nullable: true })
  speed: string;

  /** Taxa de sucesso em porcentagem — ex: 87.5 */
  @Column({ type: 'float', nullable: true })
  successRate: number;

  /** Tempo estimado de conclusão — ex: "2h 30min" */
  @Column({ nullable: true })
  estimatedTime: string;

  @Column({
    type: 'enum',
    enum: BroadcastStatus,
    default: BroadcastStatus.ACTIVE,
  })
  status: BroadcastStatus;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
