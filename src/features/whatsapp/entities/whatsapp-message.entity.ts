import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

export enum MessageDirection {
  INBOUND = 'INBOUND',
  OUTBOUND = 'OUTBOUND',
}

export enum MessageStatus {
  PENDING = 'PENDING',
  SENT = 'SENT',
  DELIVERED = 'DELIVERED',
  READ = 'READ',
  FAILED = 'FAILED',
}

@Entity('whatsapp_messages')
@Index(['tenantId', 'remoteJid'])
@Index(['tenantId', 'remotePhone'])
@Index(['tenantId', 'createdAt'])
export class WhatsappMessage {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  tenantId: string;

  @Column()
  connectionId: string;

  @Column()
  remoteJid: string;

  @Column({ nullable: true })
  remoteName: string;

  @Column({ nullable: true })
  remotePhone: string;

  @Column({ type: 'text', nullable: true })
  content: string;

  @Column({ default: 'text' })
  type: string;

  @Column({
    type: 'enum',
    enum: MessageDirection,
  })
  direction: MessageDirection;

  @Column({
    type: 'enum',
    enum: MessageStatus,
    default: MessageStatus.PENDING,
  })
  status: MessageStatus;

  @Column({ nullable: true })
  externalId: string;

  @Column({ nullable: true })
  mediaUrl: string;

  @Column({ type: 'jsonb', default: [] })
  reactions: { emoji: string; from: string }[];

  @Column({ nullable: true })
  voterId: string;

  @CreateDateColumn()
  createdAt: Date;
}
