import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Unique,
} from 'typeorm';
import { ChatConversation } from './conversation.entity';

export enum ParticipantRole {
  ADMIN = 'ADMIN',
  MEMBER = 'MEMBER',
}

@Entity('chat_participants')
@Unique(['conversationId', 'userId'])
export class ChatParticipant {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  conversationId: string;

  @ManyToOne(() => ChatConversation, (c) => c.participants, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'conversationId' })
  conversation: ChatConversation;

  @Column()
  userId: string;

  @Column({ nullable: true })
  userName: string;

  @Column({
    type: 'enum',
    enum: ParticipantRole,
    default: ParticipantRole.MEMBER,
  })
  role: ParticipantRole;

  @Column({ type: 'int', default: 0 })
  unreadCount: number;

  @Column({ type: 'timestamp', nullable: true })
  lastReadAt: Date;

  @Column({ default: false })
  muted: boolean;

  @CreateDateColumn()
  joinedAt: Date;
}
