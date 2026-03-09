import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { ModulesService } from '../../core/modules/modules.service';

// Maps each stat key to { table, moduleKey }
const STAT_MODULE_MAP: Record<string, { table: string; moduleKey: string }> = {
  voters: { table: 'voters', moduleKey: 'voters' },
  leaders: { table: 'leaders', moduleKey: 'leaders' },
  helpRecords: { table: 'help_records', moduleKey: 'help-records' },
  visits: { table: 'visits', moduleKey: 'visits' },
  tasks: { table: 'tasks', moduleKey: 'tasks' },
  appointments: { table: 'appointments', moduleKey: 'agenda' },
  bills: { table: 'legislative_bills', moduleKey: 'bills' },
  amendments: { table: 'amendments', moduleKey: 'amendments' },
  ceapExpenses: { table: 'ceap_expenses', moduleKey: 'ceap' },
  executiveRequests: { table: 'executive_requests', moduleKey: 'executive-requests' },
  electionResults: { table: 'election_results', moduleKey: 'election-analysis' },
  politicalContacts: { table: 'political_contacts', moduleKey: 'political-contacts' },
  staffMembers: { table: 'staff_members', moduleKey: 'staff' },
  projects: { table: 'law_projects', moduleKey: 'projects' },
};

@Injectable()
export class DashboardService {
  constructor(
    private dataSource: DataSource,
    private modulesService: ModulesService,
  ) {}

  private async getEnabledModuleKeys(tenantId: string): Promise<Set<string>> {
    const tenantModules = await this.modulesService.findTenantModules(tenantId);
    return new Set(
      tenantModules.filter((m) => m.enabled).map((m) => m.moduleKey),
    );
  }

  async getStats(tenantId: string) {
    const enabledKeys = await this.getEnabledModuleKeys(tenantId);
    const counts: Record<string, number> = {};

    for (const [key, { table, moduleKey }] of Object.entries(STAT_MODULE_MAP)) {
      if (!enabledKeys.has(moduleKey)) continue;
      try {
        const result = await this.dataSource.query(
          `SELECT COUNT(*) as count FROM "${table}" WHERE "tenantId" = $1`,
          [tenantId],
        );
        counts[key] = parseInt(result[0].count, 10);
      } catch {
        counts[key] = 0;
      }
    }

    return { totals: counts, enabledModules: [...enabledKeys] };
  }

  async getQuickActions(tenantId: string) {
    const enabledKeys = await this.getEnabledModuleKeys(tenantId);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    let todayAppointments = 0;
    let pendingTasks = 0;
    let billsInProgress = 0;
    let pendingHelpRecords = 0;

    if (enabledKeys.has('agenda')) {
      const [row] = await this.dataSource.query(
        `SELECT COUNT(*) as count FROM "appointments"
         WHERE "tenantId" = $1 AND "startDate" >= $2 AND "startDate" < $3`,
        [tenantId, today.toISOString(), tomorrow.toISOString()],
      );
      todayAppointments = parseInt(row.count, 10);
    }

    if (enabledKeys.has('tasks')) {
      const [row] = await this.dataSource.query(
        `SELECT COUNT(*) as count FROM "tasks"
         WHERE "tenantId" = $1 AND status IN ('PENDENTE', 'EM_ANDAMENTO')`,
        [tenantId],
      );
      pendingTasks = parseInt(row.count, 10);
    }

    if (enabledKeys.has('bills')) {
      const [row] = await this.dataSource.query(
        `SELECT COUNT(*) as count FROM "legislative_bills"
         WHERE "tenantId" = $1 AND status = 'EM_TRAMITACAO'`,
        [tenantId],
      );
      billsInProgress = parseInt(row.count, 10);
    }

    if (enabledKeys.has('help-records')) {
      const [row] = await this.dataSource.query(
        `SELECT COUNT(*) as count FROM "help_records"
         WHERE "tenantId" = $1 AND status = 'PENDING'`,
        [tenantId],
      );
      pendingHelpRecords = parseInt(row.count, 10);
    }

    return { todayAppointments, pendingTasks, billsInProgress, pendingHelpRecords };
  }

  async getBirthdays(tenantId: string) {
    const enabledKeys = await this.getEnabledModuleKeys(tenantId);
    const today = new Date();
    const todayMD = `${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

    const nextWeek = new Date(today);
    nextWeek.setDate(nextWeek.getDate() + 7);

    const voterBirthdays = enabledKeys.has('voters')
      ? await this.dataSource.query(
          `SELECT id, name, "birthDate", phone, email, neighborhood, 'voter' as type
           FROM "voters"
           WHERE "tenantId" = $1 AND "birthDate" IS NOT NULL
           ORDER BY EXTRACT(MONTH FROM "birthDate"), EXTRACT(DAY FROM "birthDate")`,
          [tenantId],
        )
      : [];

    const leaderBirthdays = enabledKeys.has('leaders')
      ? await this.dataSource.query(
          `SELECT id, name, phone, email, region as neighborhood, 'leader' as type
           FROM "leaders"
           WHERE "tenantId" = $1`,
          [tenantId],
        )
      : [];

    const result: any[] = [];
    const allPeople = [...voterBirthdays, ...leaderBirthdays];

    for (const person of allPeople) {
      if (!person.birthDate) continue;
      const bd = new Date(person.birthDate);
      const personMD = `${String(bd.getMonth() + 1).padStart(2, '0')}-${String(bd.getDate()).padStart(2, '0')}`;

      const thisYearBd = new Date(today.getFullYear(), bd.getMonth(), bd.getDate());
      const diff = Math.floor((thisYearBd.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

      if (personMD === todayMD || (diff >= 0 && diff <= 7)) {
        result.push({
          id: person.id,
          name: person.name,
          type: person.type,
          birthDate: person.birthDate,
          phone: person.phone,
          email: person.email,
          neighborhood: person.neighborhood,
          isToday: personMD === todayMD,
          daysUntil: personMD === todayMD ? 0 : diff,
          age: today.getFullYear() - bd.getFullYear(),
        });
      }
    }

    result.sort((a, b) => a.daysUntil - b.daysUntil);
    return result;
  }

  async getChartData(tenantId: string, period: number = 30) {
    const enabledKeys = await this.getEnabledModuleKeys(tenantId);
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - period);

    const voters = enabledKeys.has('voters')
      ? await this.dataSource.query(
          `SELECT DATE("createdAt") as date, COUNT(*) as count
           FROM "voters" WHERE "tenantId" = $1 AND "createdAt" >= $2
           GROUP BY DATE("createdAt") ORDER BY date`,
          [tenantId, startDate.toISOString()],
        )
      : [];

    const visits = enabledKeys.has('visits')
      ? await this.dataSource.query(
          `SELECT DATE("createdAt") as date, COUNT(*) as count
           FROM "visits" WHERE "tenantId" = $1 AND "createdAt" >= $2
           GROUP BY DATE("createdAt") ORDER BY date`,
          [tenantId, startDate.toISOString()],
        )
      : [];

    const dateMap: Record<string, { voters: number; visits: number }> = {};

    for (let i = 0; i <= period; i++) {
      const d = new Date(startDate);
      d.setDate(d.getDate() + i);
      const key = d.toISOString().split('T')[0];
      dateMap[key] = { voters: 0, visits: 0 };
    }

    for (const row of voters) {
      const key = new Date(row.date).toISOString().split('T')[0];
      if (dateMap[key]) dateMap[key].voters = parseInt(row.count, 10);
    }

    for (const row of visits) {
      const key = new Date(row.date).toISOString().split('T')[0];
      if (dateMap[key]) dateMap[key].visits = parseInt(row.count, 10);
    }

    return Object.entries(dateMap).map(([date, data]) => ({
      date,
      voters: data.voters,
      visits: data.visits,
    }));
  }

  async getInsights(tenantId: string) {
    const enabledKeys = await this.getEnabledModuleKeys(tenantId);
    const now = new Date();
    const result: any = {};

    // Voter analysis (requires 'voters' module)
    if (enabledKeys.has('voters')) {
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);

      const [thisMonth] = await this.dataSource.query(
        `SELECT COUNT(*) as count FROM "voters"
         WHERE "tenantId" = $1 AND "createdAt" >= $2`,
        [tenantId, startOfMonth.toISOString()],
      );

      const [lastMonth] = await this.dataSource.query(
        `SELECT COUNT(*) as count FROM "voters"
         WHERE "tenantId" = $1 AND "createdAt" >= $2 AND "createdAt" < $3`,
        [tenantId, startOfLastMonth.toISOString(), startOfMonth.toISOString()],
      );

      const topNeighborhoods = await this.dataSource.query(
        `SELECT neighborhood, COUNT(*) as count FROM "voters"
         WHERE "tenantId" = $1 AND neighborhood IS NOT NULL AND neighborhood != ''
         GROUP BY neighborhood ORDER BY count DESC LIMIT 6`,
        [tenantId],
      );

      const [totalVoters] = await this.dataSource.query(
        `SELECT COUNT(*) as count FROM "voters" WHERE "tenantId" = $1`,
        [tenantId],
      );

      const thisMonthCount = parseInt(thisMonth.count, 10);
      const lastMonthCount = parseInt(lastMonth.count, 10);
      const totalVotersCount = parseInt(totalVoters.count, 10);
      const growth = lastMonthCount > 0
        ? ((thisMonthCount - lastMonthCount) / lastMonthCount) * 100
        : 0;

      result.voterAnalysis = {
        thisMonth: thisMonthCount,
        lastMonth: lastMonthCount,
        growth: Math.round(growth * 10) / 10,
        topNeighborhoods: topNeighborhoods.map((n: any) => ({
          name: n.neighborhood,
          count: parseInt(n.count, 10),
          percentage: totalVotersCount > 0
            ? Math.round((parseInt(n.count, 10) / totalVotersCount) * 1000) / 10
            : 0,
        })),
      };

      // Trends (tied to voters)
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const dayOfWeek = await this.dataSource.query(
        `SELECT EXTRACT(DOW FROM "createdAt") as dow, COUNT(*) as count
         FROM "voters" WHERE "tenantId" = $1 AND "createdAt" >= $2
         GROUP BY dow ORDER BY dow`,
        [tenantId, thirtyDaysAgo.toISOString()],
      );

      const [thisWeek] = await this.dataSource.query(
        `SELECT COUNT(*) as count FROM "voters"
         WHERE "tenantId" = $1 AND "createdAt" >= NOW() - INTERVAL '7 days'`,
        [tenantId],
      );

      const [lastWeek] = await this.dataSource.query(
        `SELECT COUNT(*) as count FROM "voters"
         WHERE "tenantId" = $1 AND "createdAt" >= NOW() - INTERVAL '14 days'
         AND "createdAt" < NOW() - INTERVAL '7 days'`,
        [tenantId],
      );

      result.trends = {
        thisWeek: parseInt(thisWeek.count, 10),
        lastWeek: parseInt(lastWeek.count, 10),
        weeklyChange: parseInt(thisWeek.count, 10) - parseInt(lastWeek.count, 10),
        dayOfWeek: dayOfWeek.map((d: any) => ({
          day: parseInt(d.dow, 10),
          count: parseInt(d.count, 10),
        })),
      };
    }

    // Leader performance (requires 'leaders' module)
    if (enabledKeys.has('leaders')) {
      const [totalVoters] = await this.dataSource.query(
        `SELECT COUNT(*) as count FROM "voters" WHERE "tenantId" = $1`,
        [tenantId],
      );
      const totalVotersCount = parseInt(totalVoters.count, 10);

      const leaderPerformance = await this.dataSource.query(
        `SELECT l.id, l.name, l.region, l."votersCount", l."votersGoal", l.active
         FROM "leaders" l WHERE l."tenantId" = $1 ORDER BY l."votersCount" DESC LIMIT 5`,
        [tenantId],
      );

      const [activeLeaders] = await this.dataSource.query(
        `SELECT COUNT(*) as count FROM "leaders" WHERE "tenantId" = $1 AND active = true`,
        [tenantId],
      );

      const [totalLeaders] = await this.dataSource.query(
        `SELECT COUNT(*) as count FROM "leaders" WHERE "tenantId" = $1`,
        [tenantId],
      );

      const [zeroVotersLeaders] = await this.dataSource.query(
        `SELECT COUNT(*) as count FROM "leaders" WHERE "tenantId" = $1 AND "votersCount" = 0`,
        [tenantId],
      );

      result.leaderPerformance = {
        active: parseInt(activeLeaders.count, 10),
        total: parseInt(totalLeaders.count, 10),
        zeroVoters: parseInt(zeroVotersLeaders.count, 10),
        avgPerLeader: parseInt(totalLeaders.count, 10) > 0
          ? Math.round(totalVotersCount / parseInt(totalLeaders.count, 10))
          : 0,
        top5: leaderPerformance.map((l: any) => ({
          id: l.id,
          name: l.name,
          region: l.region,
          votersCount: l.votersCount,
          votersGoal: l.votersGoal,
          progress: l.votersGoal > 0
            ? Math.round((l.votersCount / l.votersGoal) * 100)
            : 0,
        })),
      };
    }

    // Help records analysis (requires 'help-records' module)
    if (enabledKeys.has('help-records')) {
      const helpByStatus = await this.dataSource.query(
        `SELECT status, COUNT(*) as count FROM "help_records"
         WHERE "tenantId" = $1 GROUP BY status`,
        [tenantId],
      );

      const helpByCategory = await this.dataSource.query(
        `SELECT category, COUNT(*) as count FROM "help_records"
         WHERE "tenantId" = $1 GROUP BY category ORDER BY count DESC`,
        [tenantId],
      );

      result.helpRecords = {
        byStatus: Object.fromEntries(
          helpByStatus.map((r: any) => [r.status, parseInt(r.count, 10)]),
        ),
        byCategory: helpByCategory.map((c: any) => ({
          name: c.category,
          count: parseInt(c.count, 10),
        })),
      };
    }

    return result;
  }

  async getRecentActivity(tenantId: string) {
    const enabledKeys = await this.getEnabledModuleKeys(tenantId);

    const tables = [
      { name: 'help_records', label: 'Atendimento', moduleKey: 'help-records' },
      { name: 'visits', label: 'Visita', moduleKey: 'visits' },
      { name: 'tasks', label: 'Tarefa', moduleKey: 'tasks' },
      { name: 'appointments', label: 'Agenda', moduleKey: 'agenda' },
    ].filter((t) => enabledKeys.has(t.moduleKey));

    const activities: any[] = [];

    for (const { name, label } of tables) {
      const rows = await this.dataSource.query(
        `SELECT id, "createdAt" FROM "${name}" WHERE "tenantId" = $1 ORDER BY "createdAt" DESC LIMIT 5`,
        [tenantId],
      );
      for (const row of rows) {
        activities.push({
          type: label,
          id: row.id,
          createdAt: row.createdAt,
        });
      }
    }

    activities.sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );

    return activities.slice(0, 10);
  }

  async getTasksSummary(tenantId: string) {
    const enabledKeys = await this.getEnabledModuleKeys(tenantId);
    if (!enabledKeys.has('tasks')) return {};

    const result = await this.dataSource.query(
      `SELECT status, COUNT(*) as count FROM "tasks" WHERE "tenantId" = $1 GROUP BY status`,
      [tenantId],
    );

    const summary: Record<string, number> = {};
    for (const row of result) {
      summary[row.status] = parseInt(row.count, 10);
    }

    return summary;
  }

  async getHelpRecordsSummary(tenantId: string) {
    const enabledKeys = await this.getEnabledModuleKeys(tenantId);
    if (!enabledKeys.has('help-records')) return {};

    const result = await this.dataSource.query(
      `SELECT status, COUNT(*) as count FROM "help_records" WHERE "tenantId" = $1 GROUP BY status`,
      [tenantId],
    );

    const summary: Record<string, number> = {};
    for (const row of result) {
      summary[row.status] = parseInt(row.count, 10);
    }

    return summary;
  }
}
