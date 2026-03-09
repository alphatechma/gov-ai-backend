import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
} from 'typeorm';
import { ChatMessage } from './message.entity';
import { ChatParticipant } from './participant.entity';

export enum ConversationType {
  DIRECT = 'DIRECT',
  GROUP = 'GROUP',
}

@Entity('chat_conversations')
export class ChatConversation {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  tenantId: string;

  @Column({ nullable: true })
  name: string;

  @Column({
    type: 'enum',
    enum: ConversationType,
    default: ConversationType.DIRECT,
  })
  type: ConversationType;

  @Column({ nullable: true })
  avatarUrl: string;

  @Column({ nullable: true })
  lastMessageText: string;

  @Column({ type: 'timestamp', nullable: true })
  lastMessageAt: Date;

  @OneToMany(() => ChatParticipant, (p) => p.conversation, { cascade: true })
  participants: ChatParticipant[];

  @OneToMany(() => ChatMessage, (m) => m.conversation)
  messages: ChatMessage[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
