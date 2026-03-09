import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import {
  ContactRole,
  ContactRelationship,
} from '../../shared/enums/features';

@Entity('political_contacts')
export class PoliticalContact {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  tenantId: string;

  @Column()
  name: string;

  @Column({ nullable: true })
  phone: string;

  @Column({ nullable: true })
  email: string;

  @Column({ type: 'enum', enum: ContactRole })
  role: ContactRole;

  @Column({
    type: 'enum',
    enum: ContactRelationship,
    default: ContactRelationship.NEUTRO,
  })
  relationship: ContactRelationship;

  @Column({ nullable: true })
  party: string;

  @Column({ nullable: true })
  city: string;

  @Column({ nullable: true })
  state: string;

  @Column({ type: 'timestamp', nullable: true })
  lastContactAt: Date;

  @Column({ type: 'text', nullable: true })
  notes: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
