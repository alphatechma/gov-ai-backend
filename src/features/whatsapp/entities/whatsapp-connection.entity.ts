import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

export enum ConnectionStatus {
  PENDING = 'PENDING',
  CONNECTED = 'CONNECTED',
  DISCONNECTED = 'DISCONNECTED',
}

@Entity('whatsapp_connections')
@Index(['tenantId'])
@Index(['tenantId', 'isDefault'])
export class WhatsappConnection {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  tenantId: string;

  /** User-friendly label (e.g. "Gabinete", "Atendimento"). */
  @Column({ nullable: true })
  label: string;

  /** Marks the default connection for singular/legacy endpoints and as the initial selection. */
  @Column({ default: false })
  isDefault: boolean;

  @Column({ nullable: true })
  phoneNumber: string;

  @Column({ nullable: true })
  pushName: string;

  @Column({
    type: 'enum',
    enum: ConnectionStatus,
    default: ConnectionStatus.PENDING,
  })
  status: ConnectionStatus;

  @Column({ nullable: true })
  instanceName: string;

  @Column({ nullable: true })
  instanceToken: string;

  @Column({ nullable: true })
  connectedBy: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
