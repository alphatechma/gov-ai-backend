import { Module, OnModuleInit } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ThrottlerModule } from '@nestjs/throttler';
import { DataSource } from 'typeorm';
import { getDatabaseConfig } from './config/database.config';
import { runSeed } from './config/seed';

// Core
import { AuthModule } from './core/auth/auth.module';
import { TenantsModule } from './core/tenants/tenants.module';
import { UsersModule } from './core/users/users.module';
import { PlansModule } from './core/plans/plans.module';
import { ModulesModule } from './core/modules/modules.module';
import { AuditLogModule } from './core/audit-log/audit-log.module';

// Features
import { VotersModule } from './features/voters/voters.module';
import { LeadersModule } from './features/leaders/leaders.module';
import { VisitsModule } from './features/visits/visits.module';
import { HelpRecordsModule } from './features/help-records/help-records.module';
import { TasksModule } from './features/tasks/tasks.module';
import { StaffModule } from './features/staff/staff.module';
import { AppointmentsModule } from './features/appointments/appointments.module';
import { ProjectsModule } from './features/projects/projects.module';
import { BillsModule } from './features/bills/bills.module';
import { AmendmentsModule } from './features/amendments/amendments.module';
import { VotingRecordsModule } from './features/voting-records/voting-records.module';
import { PoliticalContactsModule } from './features/political-contacts/political-contacts.module';
import { CeapModule } from './features/ceap/ceap.module';
import { ExecutiveRequestsModule } from './features/executive-requests/executive-requests.module';
import { ElectionResultsModule } from './features/election-results/election-results.module';
import { ChatModule } from './features/chat/chat.module';
import { AiModule } from './features/ai/ai.module';
import { ReportsModule } from './features/reports/reports.module';
import { DashboardModule } from './features/dashboard/dashboard.module';
import { WhatsappModule } from './features/whatsapp/whatsapp.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),

    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: getDatabaseConfig,
    }),

    ThrottlerModule.forRoot([
      { name: 'short', ttl: 1000, limit: 10 },
      { name: 'long', ttl: 60000, limit: 100 },
    ]),

    // Core
    AuthModule,
    TenantsModule,
    UsersModule,
    PlansModule,
    ModulesModule,
    AuditLogModule,

    // Features
    VotersModule,
    LeadersModule,
    VisitsModule,
    HelpRecordsModule,
    TasksModule,
    StaffModule,
    AppointmentsModule,
    ProjectsModule,
    BillsModule,
    AmendmentsModule,
    VotingRecordsModule,
    PoliticalContactsModule,
    CeapModule,
    ExecutiveRequestsModule,
    ElectionResultsModule,
    ChatModule,
    AiModule,
    ReportsModule,
    DashboardModule,
    WhatsappModule,
  ],
})
export class AppModule implements OnModuleInit {
  constructor(private dataSource: DataSource) {}

  async onModuleInit() {
    await runSeed(this.dataSource);
  }
}
