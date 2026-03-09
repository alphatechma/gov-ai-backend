import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from 'typeorm';
import { ModuleCategory, PoliticalProfile } from '../../shared/enums';

@Entity('system_modules')
export class SystemModule {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  key: string;

  @Column()
  name: string;

  @Column({ nullable: true })
  description: string;

  @Column({ type: 'enum', enum: ModuleCategory })
  category: ModuleCategory;

  @Column({ nullable: true })
  icon: string;

  @Column({ type: 'jsonb', default: [] })
  availableFor: PoliticalProfile[];

  @Column({ default: false })
  isCore: boolean;

  @Column({ default: false })
  isAddon: boolean;

  @CreateDateColumn()
  createdAt: Date;
}
