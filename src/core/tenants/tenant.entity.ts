import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { PoliticalProfile } from '../../shared/enums';
import { User } from '../users/user.entity';
import { TenantModule } from '../modules/tenant-module.entity';
import { Plan } from '../plans/plan.entity';

@Entity('tenants')
export class Tenant {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column({ unique: true })
  slug: string;

  @Column({ type: 'enum', enum: PoliticalProfile })
  politicalProfile: PoliticalProfile;

  @Column({ nullable: true })
  party: string;

  @Column()
  state: string;

  @Column({ nullable: true })
  city: string;

  @Column({ nullable: true })
  logoUrl: string;

  @Column({ nullable: true })
  bannerUrl: string;

  @Column({ nullable: true })
  faviconUrl: string;

  @Column({ nullable: true })
  appName: string;

  @Column({ nullable: true })
  primaryColor: string;

  @Column({ nullable: true })
  primaryColorDark: string;

  @Column({ nullable: true })
  loginBgColor: string;

  @Column({ nullable: true })
  loginBgColorEnd: string;

  @Column({ nullable: true })
  dashboardBannerUrl: string;

  @Column({ nullable: true })
  sidebarColor: string;

  @Column({ nullable: true })
  headerColor: string;

  @Column({ nullable: true })
  fontFamily: string;

  @Column({ nullable: true })
  borderRadius: string;

  @Column({ default: false })
  showBannerInSidebar: boolean;

  @Column({ nullable: true, default: 'bottom' })
  sidebarBannerPosition: string;

  @Column({ default: true })
  active: boolean;

  @Column({ nullable: true })
  planId: string;

  @ManyToOne(() => Plan, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'planId' })
  plan: Plan;

  @Column({ type: 'timestamp', nullable: true })
  planExpiresAt: Date;

  @OneToMany(() => User, (user) => user.tenant)
  users: User[];

  @OneToMany(() => TenantModule, (tm) => tm.tenant)
  modules: TenantModule[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
