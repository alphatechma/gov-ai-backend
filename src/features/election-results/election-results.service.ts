import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { ElectionResult } from './election-result.entity';
import { TenantAwareService } from '../../shared/base/tenant-aware.service';
import { Tenant } from '../../core/tenants/tenant.entity';
import { PoliticalProfile } from '../../shared/enums';
import AdmZip = require('adm-zip');

const MUNICIPAL_PROFILES = [
  PoliticalProfile.VEREADOR,
  PoliticalProfile.PREFEITO,
  PoliticalProfile.VICE_PREFEITO,
];

function resolveElectionYear(profile: PoliticalProfile): number {
  return MUNICIPAL_PROFILES.includes(profile) ? 2024 : 2022;
}

function normalizeStr(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

const PARTY_MAP: Record<string, string> = {
  '10': 'REPUBLICANOS', '11': 'PP', '12': 'PDT', '13': 'PT', '14': 'PTB',
  '15': 'MDB', '16': 'PSTU', '17': 'PSL', '18': 'REDE', '19': 'PODE',
  '20': 'PODE', '21': 'PCB', '22': 'PL', '23': 'CIDADANIA', '25': 'PRD',
  '27': 'DC', '28': 'PRTB', '29': 'PCO', '30': 'NOVO', '33': 'PMB',
  '35': 'PMB', '36': 'AGIR', '40': 'PSB', '43': 'PV', '44': 'UNIAO',
  '45': 'PSDB', '50': 'PSOL', '55': 'PSD', '65': 'PCdoB', '70': 'AVANTE',
  '77': 'SOLIDARIEDADE', '80': 'UP',
};

function partyFromNumber(candidateNumber: string): string | null {
  if (!candidateNumber || candidateNumber.length < 2) return null;
  const prefix = candidateNumber.substring(0, 2);
  return PARTY_MAP[prefix] || null;
}

@Injectable()
export class ElectionResultsService extends TenantAwareService<ElectionResult> {
  constructor(
    @InjectRepository(ElectionResult) repo: Repository<ElectionResult>,
    private dataSource: DataSource,
  ) {
    super(repo);
  }

  private yearFilter(tenant: Tenant, queryYear?: number): number {
    return queryYear ?? resolveElectionYear(tenant.politicalProfile);
  }

  // ── Summary ──
  async getSummary(tenantId: string, tenant: Tenant, queryYear?: number, round?: number) {
    const year = this.yearFilter(tenant, queryYear);
    const params: any[] = [tenantId, year];
    let roundClause = '';
    if (round) {
      roundClause = ' AND "round" = $3';
      params.push(round);
    }

    const [totals] = await this.dataSource.query(
      `SELECT
        COALESCE(SUM("candidateVotes"), 0) as "totalCandidateVotes",
        COUNT(DISTINCT "zone") as "totalZones",
        COUNT(DISTINCT "section") as "totalSections",
        COUNT(DISTINCT "city") as "totalCities",
        COUNT(DISTINCT "candidateName") as "totalCandidates",
        COALESCE(SUM("totalVotes"), 0) as "totalVotes"
      FROM "election_results"
      WHERE "tenantId" = $1 AND "electionYear" = $2 AND "isTenantCandidate" = true${roundClause}`,
      params,
    );

    const totalVotes = parseInt(totals.totalVotes, 10);
    const totalCandidateVotes = parseInt(totals.totalCandidateVotes, 10);

    return {
      electionYear: year,
      totalCandidateVotes,
      totalZones: parseInt(totals.totalZones, 10),
      totalSections: parseInt(totals.totalSections, 10),
      totalCities: parseInt(totals.totalCities, 10),
      totalCandidates: parseInt(totals.totalCandidates, 10),
      votePercentage: totalVotes > 0 ? Math.round((totalCandidateVotes / totalVotes) * 1000) / 10 : 0,
    };
  }

  // ── By Party ──
  async getByParty(tenantId: string, tenant: Tenant, queryYear?: number, round?: number) {
    const year = this.yearFilter(tenant, queryYear);
    const params: any[] = [tenantId, year];
    let roundClause = '';
    if (round) {
      roundClause = ' AND "round" = $3';
      params.push(round);
    }

    return this.dataSource.query(
      `SELECT "candidateParty" as party, SUM("candidateVotes") as votes, COUNT(DISTINCT "candidateName") as candidates
      FROM "election_results"
      WHERE "tenantId" = $1 AND "electionYear" = $2 AND "candidateParty" IS NOT NULL${roundClause}
      GROUP BY "candidateParty"
      ORDER BY votes DESC`,
      params,
    ).then(rows => rows.map((r: any) => ({
      party: r.party,
      votes: parseInt(r.votes, 10),
      candidates: parseInt(r.candidates, 10),
    })));
  }

  // ── Ranking ──
  async getRanking(tenantId: string, tenant: Tenant, queryYear?: number, round?: number, limit: number = 10) {
    const year = this.yearFilter(tenant, queryYear);
    const params: any[] = [tenantId, year];
    let roundClause = '';
    if (round) {
      roundClause = ' AND "round" = $3';
      params.push(round);
    }

    return this.dataSource.query(
      `SELECT "candidateName", "candidateNumber", "candidateParty", "isTenantCandidate",
        SUM("candidateVotes") as votes
      FROM "election_results"
      WHERE "tenantId" = $1 AND "electionYear" = $2${roundClause}
      GROUP BY "candidateName", "candidateNumber", "candidateParty", "isTenantCandidate"
      ORDER BY votes DESC
      LIMIT ${limit}`,
      params,
    ).then(rows => rows.map((r: any) => ({
      candidateName: r.candidateName,
      candidateNumber: r.candidateNumber,
      candidateParty: r.candidateParty,
      isTenantCandidate: r.isTenantCandidate,
      votes: parseInt(r.votes, 10),
    })));
  }

  // ── Candidates list ──
  async getCandidates(tenantId: string, tenant: Tenant, queryYear?: number) {
    const year = this.yearFilter(tenant, queryYear);

    return this.dataSource.query(
      `SELECT "candidateName", "candidateNumber", "candidateParty", "isTenantCandidate",
        SUM("candidateVotes") as "totalVotes"
      FROM "election_results"
      WHERE "tenantId" = $1 AND "electionYear" = $2
      GROUP BY "candidateName", "candidateNumber", "candidateParty", "isTenantCandidate"
      ORDER BY "totalVotes" DESC`,
      [tenantId, year],
    ).then(rows => rows.map((r: any, i: number) => ({
      rank: i + 1,
      candidateName: r.candidateName,
      candidateNumber: r.candidateNumber,
      candidateParty: r.candidateParty,
      isTenantCandidate: r.isTenantCandidate,
      totalVotes: parseInt(r.totalVotes, 10),
    })));
  }

  // ── By City ──
  async getByCity(tenantId: string, tenant: Tenant, queryYear?: number, round?: number, candidateName?: string) {
    const year = this.yearFilter(tenant, queryYear);
    const params: any[] = [tenantId, year];
    let extraClause = '';
    if (round) {
      extraClause += ` AND "round" = $${params.length + 1}`;
      params.push(round);
    }
    if (candidateName) {
      extraClause += ` AND "candidateName" = $${params.length + 1}`;
      params.push(candidateName);
    } else {
      extraClause += ' AND "isTenantCandidate" = true';
    }

    const rows = await this.dataSource.query(
      `SELECT "city", SUM("candidateVotes") as votes, SUM("totalVotes") as "totalVotes",
        COUNT(DISTINCT "zone") as "zonesCount", COUNT(DISTINCT "section") as "sectionsCount"
      FROM "election_results"
      WHERE "tenantId" = $1 AND "electionYear" = $2${extraClause}
      GROUP BY "city"
      ORDER BY votes DESC`,
      params,
    );

    const grandTotal = rows.reduce((sum: number, r: any) => sum + parseInt(r.votes, 10), 0);

    return rows.map((r: any) => {
      const votes = parseInt(r.votes, 10);
      return {
        city: r.city,
        votes,
        totalVotes: parseInt(r.totalVotes, 10),
        zonesCount: parseInt(r.zonesCount, 10),
        sectionsCount: parseInt(r.sectionsCount, 10),
        percentage: grandTotal > 0 ? Math.round((votes / grandTotal) * 1000) / 10 : 0,
      };
    });
  }

  // ── By Zone ──
  async getByZone(tenantId: string, tenant: Tenant, queryYear?: number, round?: number) {
    const year = this.yearFilter(tenant, queryYear);
    const params: any[] = [tenantId, year];
    let roundClause = '';
    if (round) {
      roundClause = ' AND "round" = $3';
      params.push(round);
    }

    return this.dataSource.query(
      `SELECT "zone", SUM("candidateVotes") as votes, SUM("totalVotes") as "totalVotes",
        COUNT(DISTINCT "section") as sections
      FROM "election_results"
      WHERE "tenantId" = $1 AND "electionYear" = $2 AND "isTenantCandidate" = true${roundClause}
      GROUP BY "zone"
      ORDER BY "zone"`,
      params,
    ).then(rows => rows.map((r: any) => ({
      zone: r.zone,
      votes: parseInt(r.votes, 10),
      totalVotes: parseInt(r.totalVotes, 10),
      sections: parseInt(r.sections, 10),
      percentage: parseInt(r.totalVotes, 10) > 0
        ? Math.round((parseInt(r.votes, 10) / parseInt(r.totalVotes, 10)) * 1000) / 10
        : 0,
    })));
  }

  // ── Zones list ──
  async getZones(tenantId: string, tenant: Tenant, queryYear?: number) {
    const year = this.yearFilter(tenant, queryYear);
    return this.dataSource.query(
      `SELECT DISTINCT "zone" FROM "election_results"
      WHERE "tenantId" = $1 AND "electionYear" = $2
      ORDER BY "zone"`,
      [tenantId, year],
    ).then(rows => rows.map((r: any) => r.zone));
  }

  // ── By Section ──
  async getBySection(tenantId: string, tenant: Tenant, queryYear?: number, round?: number, zone?: string) {
    const year = this.yearFilter(tenant, queryYear);
    const params: any[] = [tenantId, year];
    let extraClause = '';
    if (round) {
      extraClause += ` AND "round" = $${params.length + 1}`;
      params.push(round);
    }
    if (zone) {
      extraClause += ` AND "zone" = $${params.length + 1}`;
      params.push(zone);
    }

    return this.dataSource.query(
      `SELECT "zone", "section", "candidateVotes" as votes, "totalVotes", "candidateName", "isTenantCandidate"
      FROM "election_results"
      WHERE "tenantId" = $1 AND "electionYear" = $2${extraClause}
      ORDER BY "zone", "section"`,
      params,
    ).then(rows => rows.map((r: any) => ({
      zone: r.zone,
      section: r.section,
      votes: parseInt(r.votes, 10),
      totalVotes: parseInt(r.totalVotes, 10),
      candidateName: r.candidateName,
      isTenantCandidate: r.isTenantCandidate,
      percentage: parseInt(r.totalVotes, 10) > 0
        ? Math.round((parseInt(r.votes, 10) / parseInt(r.totalVotes, 10)) * 1000) / 10
        : 0,
    })));
  }

  // ── Section Details (leader per section) ──
  async getSectionDetails(tenantId: string, tenant: Tenant, queryYear?: number, round?: number, zone?: string) {
    const year = this.yearFilter(tenant, queryYear);
    const params: any[] = [tenantId, year];
    let extraClause = '';
    if (round) {
      extraClause += ` AND "round" = $${params.length + 1}`;
      params.push(round);
    }
    if (zone) {
      extraClause += ` AND "zone" = $${params.length + 1}`;
      params.push(zone);
    }

    const rows = await this.dataSource.query(
      `SELECT "zone", "section", "candidateName", "candidateNumber", "candidateParty", "candidateVotes", "totalVotes"
      FROM "election_results"
      WHERE "tenantId" = $1 AND "electionYear" = $2${extraClause}`,
      params,
    );

    const sectionsMap = new Map<string, any>();
    for (const r of rows) {
      const key = `${r.zone}-${r.section}`;
      const votes = parseInt(r.candidateVotes, 10) || 0;
      if (!sectionsMap.has(key) || votes > sectionsMap.get(key).topCandidateVotes) {
        sectionsMap.set(key, {
          zone: r.zone,
          section: r.section,
          topCandidateName: r.candidateName,
          topCandidateNumber: r.candidateNumber,
          topCandidateParty: r.candidateParty,
          topCandidateVotes: votes,
          totalVotes: parseInt(r.totalVotes, 10) || 0,
        });
      }
    }

    return Array.from(sectionsMap.values())
      .sort((a, b) => (a.zone < b.zone ? -1 : a.zone > b.zone ? 1 : 0) || (a.section < b.section ? -1 : a.section > b.section ? 1 : 0));
  }

  // ── Candidate By Zone ──
  async getCandidateByZone(tenantId: string, tenant: Tenant, candidateName: string, queryYear?: number) {
    const year = this.yearFilter(tenant, queryYear);
    return this.dataSource.query(
      `SELECT "zone", SUM("candidateVotes") as votes
      FROM "election_results"
      WHERE "tenantId" = $1 AND "electionYear" = $2 AND "candidateName" = $3
      GROUP BY "zone"
      ORDER BY "zone"`,
      [tenantId, year, candidateName],
    ).then(rows => rows.map((r: any) => ({
      zone: r.zone,
      votes: parseInt(r.votes, 10),
    })));
  }

  // ── Candidate By Section ──
  async getCandidateBySection(tenantId: string, tenant: Tenant, candidateName: string, queryYear?: number, zone?: string) {
    const year = this.yearFilter(tenant, queryYear);
    const params: any[] = [tenantId, year, candidateName];
    let extraClause = '';
    if (zone) {
      extraClause = ` AND "zone" = $${params.length + 1}`;
      params.push(zone);
    }

    return this.dataSource.query(
      `SELECT "zone", "section", "candidateVotes" as votes, "totalVotes"
      FROM "election_results"
      WHERE "tenantId" = $1 AND "electionYear" = $2 AND "candidateName" = $3${extraClause}
      ORDER BY "zone", "section"`,
      params,
    ).then(rows => rows.map((r: any) => ({
      zone: r.zone,
      section: r.section,
      votes: parseInt(r.votes, 10),
      totalVotes: parseInt(r.totalVotes, 10),
    })));
  }

  // ── By Neighborhood ──
  async getByNeighborhood(tenantId: string, tenant: Tenant, queryYear?: number) {
    const year = this.yearFilter(tenant, queryYear);
    const rows = await this.dataSource.query(
      `SELECT "neighborhood", SUM("candidateVotes") as votes, SUM("totalVotes") as "totalVotes",
        COUNT(DISTINCT "section") as "sectionsCount"
      FROM "election_results"
      WHERE "tenantId" = $1 AND "electionYear" = $2 AND "neighborhood" IS NOT NULL AND "neighborhood" != ''
      GROUP BY "neighborhood"
      ORDER BY votes DESC`,
      [tenantId, year],
    );

    const grandTotal = rows.reduce((sum: number, r: any) => sum + parseInt(r.votes, 10), 0);

    return rows.map((r: any) => {
      const votes = parseInt(r.votes, 10);
      return {
        neighborhood: r.neighborhood,
        totalVotes: votes,
        sectionsCount: parseInt(r.sectionsCount, 10),
        percentage: grandTotal > 0 ? Math.round((votes / grandTotal) * 1000) / 10 : 0,
      };
    });
  }

  // ── Neighborhoods list ──
  async getNeighborhoods(tenantId: string, tenant: Tenant, queryYear?: number) {
    const year = this.yearFilter(tenant, queryYear);
    return this.dataSource.query(
      `SELECT DISTINCT "neighborhood" FROM "election_results"
      WHERE "tenantId" = $1 AND "electionYear" = $2 AND "neighborhood" IS NOT NULL AND "neighborhood" != ''
      ORDER BY "neighborhood"`,
      [tenantId, year],
    ).then(rows => rows.map((r: any) => r.neighborhood));
  }

  // ── Neighborhood Details ──
  async getNeighborhoodDetails(tenantId: string, tenant: Tenant, neighborhood: string, queryYear?: number) {
    const year = this.yearFilter(tenant, queryYear);

    const ranking = await this.dataSource.query(
      `SELECT "candidateName", "candidateNumber", "candidateParty",
        SUM("candidateVotes") as "totalVotes"
      FROM "election_results"
      WHERE "tenantId" = $1 AND "electionYear" = $2 AND "neighborhood" = $3
      GROUP BY "candidateName", "candidateNumber", "candidateParty"
      ORDER BY "totalVotes" DESC
      LIMIT 10`,
      [tenantId, year, neighborhood],
    ).then(rows => rows.map((r: any, i: number) => ({
      rank: i + 1,
      name: r.candidateName,
      number: r.candidateNumber,
      party: r.candidateParty,
      totalVotes: parseInt(r.totalVotes, 10),
    })));

    const [stats] = await this.dataSource.query(
      `SELECT SUM("candidateVotes") as "totalVotes", COUNT(DISTINCT "section") as "sectionsCount"
      FROM "election_results"
      WHERE "tenantId" = $1 AND "electionYear" = $2 AND "neighborhood" = $3`,
      [tenantId, year, neighborhood],
    );

    return {
      neighborhood,
      totalVotes: parseInt(stats?.totalVotes, 10) || 0,
      sectionsCount: parseInt(stats?.sectionsCount, 10) || 0,
      ranking,
    };
  }

  // ── Insights (old-style: leaders, top candidate, concentration) ──
  async getInsights(tenantId: string, tenant: Tenant, queryYear?: number, round?: number) {
    const year = this.yearFilter(tenant, queryYear);
    const params: any[] = [tenantId, year];
    let roundClause = '';
    if (round) {
      roundClause = ' AND "round" = $3';
      params.push(round);
    }

    // Full ranking
    const allCandidates = await this.dataSource.query(
      `SELECT "candidateName", "candidateNumber", "candidateParty", "isTenantCandidate",
        SUM("candidateVotes") as votes
      FROM "election_results"
      WHERE "tenantId" = $1 AND "electionYear" = $2${roundClause}
      GROUP BY "candidateName", "candidateNumber", "candidateParty", "isTenantCandidate"
      ORDER BY votes DESC`,
      params,
    ).then(rows => rows.map((r: any) => ({
      candidateName: r.candidateName,
      candidateNumber: r.candidateNumber,
      candidateParty: r.candidateParty,
      isTenantCandidate: r.isTenantCandidate,
      totalVotes: parseInt(r.votes, 10),
    })));

    const topCandidate = allCandidates[0] || null;
    const runnerUp = allCandidates[1] || null;
    const voteDifference = topCandidate && runnerUp ? topCandidate.totalVotes - runnerUp.totalVotes : 0;
    const percentageDifference = runnerUp?.totalVotes > 0
      ? Math.round((voteDifference / runnerUp.totalVotes) * 1000) / 10 : 0;

    // Top/bottom sections
    const sections = await this.dataSource.query(
      `SELECT "zone", "section", SUM("candidateVotes") as votes
      FROM "election_results"
      WHERE "tenantId" = $1 AND "electionYear" = $2${roundClause}
      GROUP BY "zone", "section"
      ORDER BY votes DESC`,
      params,
    );
    const topSection = sections[0] ? { zone: sections[0].zone, section: sections[0].section, votes: parseInt(sections[0].votes, 10) } : null;

    // Leaders by zone
    const zones = await this.getZones(tenantId, tenant, queryYear);
    const leadersByZone: any[] = [];
    for (const zone of zones.slice(0, 15)) {
      const [leader] = await this.dataSource.query(
        `SELECT "candidateName" as name, "candidateNumber" as number, "candidateParty" as party,
          SUM("candidateVotes") as votes
        FROM "election_results"
        WHERE "tenantId" = $1 AND "electionYear" = $2 AND "zone" = $3
        GROUP BY "candidateName", "candidateNumber", "candidateParty"
        ORDER BY votes DESC
        LIMIT 1`,
        [tenantId, year, zone],
      );
      if (leader) {
        leadersByZone.push({ zone, leader: { ...leader, votes: parseInt(leader.votes, 10) } });
      }
    }

    // Concentration
    const totalVotesAll = allCandidates.reduce((s: number, c: any) => s + c.totalVotes, 0);
    const top3Votes = allCandidates.slice(0, 3).reduce((s: number, c: any) => s + c.totalVotes, 0);
    const concentrationRate = totalVotesAll > 0 ? Math.round((top3Votes / totalVotesAll) * 1000) / 10 : 0;

    // Performance by zone (tenant candidate)
    const byZone = await this.dataSource.query(
      `SELECT "zone", SUM("candidateVotes") as votes, SUM("totalVotes") as "totalVotes"
      FROM "election_results"
      WHERE "tenantId" = $1 AND "electionYear" = $2 AND "isTenantCandidate" = true${roundClause}
      GROUP BY "zone"
      ORDER BY votes DESC`,
      params,
    );

    const zonePerformance = byZone.map((r: any) => ({
      zone: r.zone,
      votes: parseInt(r.votes, 10),
      totalVotes: parseInt(r.totalVotes, 10),
      percentage: parseInt(r.totalVotes, 10) > 0
        ? Math.round((parseInt(r.votes, 10) / parseInt(r.totalVotes, 10)) * 1000) / 10
        : 0,
    }));

    const avgPercentage = zonePerformance.length > 0
      ? zonePerformance.reduce((s: number, z: any) => s + z.percentage, 0) / zonePerformance.length
      : 0;

    // Strongest/weakest
    const strongestZone = zonePerformance[0] ?? null;
    const weakestZone = zonePerformance.length > 0 ? zonePerformance[zonePerformance.length - 1] : null;

    // Top 5 concentration for tenant
    const tenantTotalVotes = zonePerformance.reduce((s: number, z: any) => s + z.votes, 0);
    const top5Votes = zonePerformance.slice(0, 5).reduce((s: number, z: any) => s + z.votes, 0);
    const tenantConcentration = tenantTotalVotes > 0 ? Math.round((top5Votes / tenantTotalVotes) * 1000) / 10 : 0;

    // Cities for tenant
    const byCity = await this.dataSource.query(
      `SELECT "city", SUM("candidateVotes") as votes
      FROM "election_results"
      WHERE "tenantId" = $1 AND "electionYear" = $2 AND "isTenantCandidate" = true${roundClause}
      GROUP BY "city"
      ORDER BY votes DESC`,
      params,
    );
    const strongestCity = byCity[0] ? { city: byCity[0].city, votes: parseInt(byCity[0].votes, 10) } : null;

    return {
      topCandidate,
      runnerUp,
      voteDifference,
      percentageDifference,
      topSection,
      concentrationRate,
      totalCandidates: allCandidates.length,
      leadersByZone,
      strongestZone,
      weakestZone,
      strongestCity,
      tenantConcentration,
      avgPercentage: Math.round(avgPercentage * 10) / 10,
      totalVotes: tenantTotalVotes,
      performanceByZone: zonePerformance.map(z => ({
        ...z,
        vsAverage: Math.round((z.percentage - avgPercentage) * 10) / 10,
      })),
    };
  }

  // ── Comparison (zone-by-zone / city-by-city with winner) ──
  async getComparison(tenantId: string, tenant: Tenant, candidateNames: string[], queryYear?: number, round?: number) {
    const year = this.yearFilter(tenant, queryYear);
    if (!candidateNames || candidateNames.length < 2) return null;

    const c1Name = candidateNames[0];
    const c2Name = candidateNames[1];

    const [c1Zones, c2Zones] = await Promise.all([
      this.getCandidateByZone(tenantId, tenant, c1Name, queryYear),
      this.getCandidateByZone(tenantId, tenant, c2Name, queryYear),
    ]);

    const zones = await this.getZones(tenantId, tenant, queryYear);

    const zoneComparison = zones.map((zone: string) => {
      const v1 = c1Zones.find((z: any) => z.zone === zone)?.votes || 0;
      const v2 = c2Zones.find((z: any) => z.zone === zone)?.votes || 0;
      return {
        zone,
        candidate1Votes: v1,
        candidate2Votes: v2,
        difference: v1 - v2,
        winner: v1 > v2 ? 1 : v2 > v1 ? 2 : 0,
      };
    });

    const total1 = zoneComparison.reduce((s, c) => s + c.candidate1Votes, 0);
    const total2 = zoneComparison.reduce((s, c) => s + c.candidate2Votes, 0);

    // Get candidate info
    const [c1Info] = await this.dataSource.query(
      `SELECT "candidateName", "candidateNumber", "candidateParty"
      FROM "election_results"
      WHERE "tenantId" = $1 AND "electionYear" = $2 AND "candidateName" = $3 LIMIT 1`,
      [tenantId, year, c1Name],
    );
    const [c2Info] = await this.dataSource.query(
      `SELECT "candidateName", "candidateNumber", "candidateParty"
      FROM "election_results"
      WHERE "tenantId" = $1 AND "electionYear" = $2 AND "candidateName" = $3 LIMIT 1`,
      [tenantId, year, c2Name],
    );

    return {
      candidate1: {
        name: c1Info?.candidateName || c1Name,
        number: c1Info?.candidateNumber || '',
        party: c1Info?.candidateParty || '',
        totalVotes: total1,
        zonesWon: zoneComparison.filter(c => c.winner === 1).length,
      },
      candidate2: {
        name: c2Info?.candidateName || c2Name,
        number: c2Info?.candidateNumber || '',
        party: c2Info?.candidateParty || '',
        totalVotes: total2,
        zonesWon: zoneComparison.filter(c => c.winner === 2).length,
      },
      comparison: zoneComparison,
      overallWinner: total1 > total2 ? 1 : total2 > total1 ? 2 : 0,
    };
  }

  // ── Projections ──
  async getProjections(tenantId: string, tenant: Tenant, queryYear?: number, round?: number) {
    const year = this.yearFilter(tenant, queryYear);
    const params: any[] = [tenantId, year];
    let roundClause = '';
    if (round) {
      roundClause = ' AND "round" = $3';
      params.push(round);
    }

    const byZone = await this.dataSource.query(
      `SELECT "zone", SUM("candidateVotes") as votes, SUM("totalVotes") as "totalVotes"
      FROM "election_results"
      WHERE "tenantId" = $1 AND "electionYear" = $2 AND "isTenantCandidate" = true${roundClause}
      GROUP BY "zone"
      ORDER BY votes DESC`,
      params,
    );

    const zones = byZone.map((r: any) => ({
      zone: r.zone,
      votes: parseInt(r.votes, 10),
      totalVotes: parseInt(r.totalVotes, 10),
      percentage: parseInt(r.totalVotes, 10) > 0
        ? (parseInt(r.votes, 10) / parseInt(r.totalVotes, 10)) * 100
        : 0,
    }));

    const currentTotal = zones.reduce((s, z) => s + z.votes, 0);
    const avgPercentage = zones.length > 0
      ? zones.reduce((s, z) => s + z.percentage, 0) / zones.length
      : 0;

    const weakZones = zones.filter(z => z.percentage < avgPercentage);
    const weakZonesVotes = weakZones.reduce((s, z) => s + z.votes, 0);

    const scenario10 = weakZones.reduce((s, z) => s + Math.round(z.totalVotes * 0.10), 0);
    const scenario20 = weakZones.reduce((s, z) => s + Math.round(z.totalVotes * 0.20), 0);

    // Multi-year trend
    const years = await this.dataSource.query(
      `SELECT DISTINCT "electionYear" FROM "election_results"
      WHERE "tenantId" = $1 AND "isTenantCandidate" = true
      ORDER BY "electionYear"`,
      [tenantId],
    );

    let trend = null;
    if (years.length > 1) {
      const yearlyTotals = await this.dataSource.query(
        `SELECT "electionYear", SUM("candidateVotes") as votes
        FROM "election_results"
        WHERE "tenantId" = $1 AND "isTenantCandidate" = true
        GROUP BY "electionYear"
        ORDER BY "electionYear"`,
        [tenantId],
      );
      trend = yearlyTotals.map((r: any) => ({
        year: r.electionYear,
        votes: parseInt(r.votes, 10),
      }));
    }

    return {
      currentTotal,
      weakZonesCount: weakZones.length,
      weakZonesVotes,
      scenarios: [
        { label: '+10% nas zonas fracas', additionalVotes: scenario10, projectedTotal: currentTotal + scenario10 },
        { label: '+20% nas zonas fracas', additionalVotes: scenario20, projectedTotal: currentTotal + scenario20 },
      ],
      trend,
    };
  }

  // ── Bulk Create ──
  async bulkCreate(tenantId: string, tenant: Tenant, data: any[]) {
    const tenantName = normalizeStr(tenant.name);

    const entities = data.map(row => {
      const isTenantCandidate = row.isTenantCandidate ?? normalizeStr(row.candidateName || '') === tenantName;
      return this.repository.create({
        tenantId,
        electionYear: row.electionYear,
        round: row.round ?? 1,
        candidateName: row.candidateName,
        candidateNumber: row.candidateNumber ?? null,
        candidateParty: row.candidateParty ?? null,
        isTenantCandidate,
        zone: row.zone ?? null,
        section: row.section ?? null,
        city: row.city ?? null,
        state: row.state ?? null,
        neighborhood: row.neighborhood ?? null,
        candidateVotes: row.candidateVotes ?? 0,
        totalVotes: row.totalVotes ?? 0,
        party: row.party ?? null,
      } as any);
    });

    return this.repository.save(entities as any, { chunk: 500 });
  }

  // ── Import CSV ──
  async importFromCSV(
    tenantId: string,
    tenant: Tenant,
    csvBuffer: Buffer,
    candidateName?: string,
  ): Promise<{ imported: number; skipped: number; candidates: string[] }> {
    const tenantName = normalizeStr(candidateName || tenant.name);
    const content = csvBuffer.toString('latin1');
    const lines = content.split(/\r?\n/);

    if (lines.length < 2) {
      return { imported: 0, skipped: 0, candidates: [] };
    }

    const headers = lines[0].split(';').map(h => h.replace(/"/g, '').trim());

    let imported = 0;
    let skipped = 0;
    const candidatesSet = new Set<string>();
    const batch: any[] = [];

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      const values = line.split(';').map(v => v.replace(/"/g, '').trim());
      const row: Record<string, string> = {};
      headers.forEach((h, idx) => { row[h] = values[idx] || ''; });

      const name = row['NM_VOTAVEL'] || '';
      if (!name) { skipped++; continue; }

      const isTenantCandidate = normalizeStr(name) === tenantName;
      candidatesSet.add(name);

      const candidateNum = row['NR_VOTAVEL'] || '';
      const party = row['SG_PARTIDO'] || partyFromNumber(candidateNum);

      batch.push({
        tenantId,
        electionYear: parseInt(row['ANO_ELEICAO']) || 2024,
        round: parseInt(row['NR_TURNO']) || 1,
        candidateName: name,
        candidateNumber: candidateNum || null,
        candidateParty: party,
        isTenantCandidate,
        zone: row['NR_ZONA'] || null,
        section: row['NR_SECAO'] || null,
        city: row['NM_MUNICIPIO'] || null,
        state: row['SG_UF'] || null,
        neighborhood: null,
        candidateVotes: parseInt(row['QT_VOTOS']) || 0,
        totalVotes: 0,
        party: party,
      });

      if (batch.length >= 500) {
        await this.insertBatch(batch);
        imported += batch.length;
        batch.length = 0;
      }
    }

    if (batch.length > 0) {
      await this.insertBatch(batch);
      imported += batch.length;
    }

    await this.recalcTotalVotes(tenantId);

    return {
      imported,
      skipped,
      candidates: Array.from(candidatesSet).sort(),
    };
  }

  private async insertBatch(rows: any[]) {
    const escapeSql = (str: string) => str ? str.replace(/'/g, "''") : '';
    const values = rows.map(r =>
      `('${r.tenantId}', ${r.electionYear}, ${r.round}, '${escapeSql(r.candidateName)}', ${r.candidateNumber ? `'${escapeSql(r.candidateNumber)}'` : 'NULL'}, ${r.candidateParty ? `'${escapeSql(r.candidateParty)}'` : 'NULL'}, ${r.isTenantCandidate}, ${r.zone ? `'${escapeSql(r.zone)}'` : 'NULL'}, ${r.section ? `'${escapeSql(r.section)}'` : 'NULL'}, ${r.city ? `'${escapeSql(r.city)}'` : 'NULL'}, ${r.state ? `'${escapeSql(r.state)}'` : 'NULL'}, NULL, ${r.candidateVotes}, ${r.totalVotes}, ${r.party ? `'${escapeSql(r.party)}'` : 'NULL'})`,
    ).join(',\n');

    await this.dataSource.query(`
      INSERT INTO election_results
      ("tenantId", "electionYear", "round", "candidateName", "candidateNumber", "candidateParty", "isTenantCandidate", "zone", "section", "city", "state", "neighborhood", "candidateVotes", "totalVotes", "party")
      VALUES ${values}
    `);
  }

  private async recalcTotalVotes(tenantId: string) {
    await this.dataSource.query(`
      UPDATE election_results er
      SET "totalVotes" = sub.total
      FROM (
        SELECT "tenantId", "electionYear", "round", "zone", "section",
          SUM("candidateVotes") as total
        FROM election_results
        WHERE "tenantId" = $1
        GROUP BY "tenantId", "electionYear", "round", "zone", "section"
      ) sub
      WHERE er."tenantId" = sub."tenantId"
        AND er."electionYear" = sub."electionYear"
        AND er."round" = sub."round"
        AND er."zone" = sub."zone"
        AND er."section" = sub."section"
    `, [tenantId]);
  }

  // ── TSE Municipalities (IBGE API) ──
  async getTseMunicipalities(state: string): Promise<{ name: string }[]> {
    const uf = state.toUpperCase();
    const url = `https://servicodados.ibge.gov.br/api/v1/localidades/estados/${uf}/municipios?orderBy=nome`;
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Falha ao buscar municipios do IBGE para ${uf}`);
    const data = await response.json();
    return data.map((m: any) => ({ name: m.nome as string }));
  }

  // ── Import from TSE ──
  async importFromTSE(
    tenantId: string,
    tenant: Tenant,
    state: string,
    municipalityCode: string,
    year: number = 2024,
    candidateName?: string,
    municipalityName?: string,
  ): Promise<{ imported: number; skipped: number; candidates: string[] }> {
    const logger = new Logger('ElectionImport');
    const fs = require('fs');
    const path = require('path');
    const os = require('os');
    const readline = require('readline');
    const uf = state.toUpperCase();
    const url = `https://cdn.tse.jus.br/estatistica/sead/odsele/votacao_secao/votacao_secao_${year}_${uf}.zip`;

    logger.log(`Baixando dados do TSE: ${url}`);

    const zipBuffer = await this.downloadFile(url);
    logger.log(`ZIP baixado: ${(zipBuffer.length / 1024 / 1024).toFixed(1)}MB`);

    const zip = new AdmZip(zipBuffer);
    const entries = zip.getEntries();
    const csvEntry = entries.find(e => e.entryName.endsWith('.csv') || e.entryName.endsWith('.CSV'));

    if (!csvEntry) {
      throw new Error('Arquivo CSV nao encontrado no ZIP do TSE');
    }

    const tmpDir = os.tmpdir();
    const tmpCsvPath = path.join(tmpDir, `tse_${uf}_${year}.csv`);
    logger.log(`Extraindo: ${csvEntry.entryName} -> ${tmpCsvPath}`);
    zip.extractEntryTo(csvEntry, tmpDir, false, true);
    const extractedPath = path.join(tmpDir, csvEntry.entryName);
    if (extractedPath !== tmpCsvPath && fs.existsSync(extractedPath)) {
      fs.renameSync(extractedPath, tmpCsvPath);
    }

    const targetMunCode = municipalityCode ? municipalityCode.replace(/^0+/, '') : '';
    const targetMunName = municipalityName ? normalizeStr(municipalityName) : '';
    const tenantNameNorm = normalizeStr(candidateName || tenant.name);

    let imported = 0;
    let skipped = 0;
    const candidatesSet = new Set<string>();
    const batch: any[] = [];
    let headers: string[] = [];
    let lineNum = 0;

    const rl = readline.createInterface({
      input: fs.createReadStream(tmpCsvPath, { encoding: 'latin1' }),
      crlfDelay: Infinity,
    });

    for await (const rawLine of rl) {
      const line = rawLine.trim();
      if (!line) continue;

      if (lineNum === 0) {
        headers = line.split(';').map((h: string) => h.replace(/"/g, '').trim());
        lineNum++;
        continue;
      }
      lineNum++;

      const values = line.split(';').map((v: string) => v.replace(/"/g, '').trim());
      const row: Record<string, string> = {};
      headers.forEach((h, idx) => { row[h] = values[idx] || ''; });

      // Match by municipality name (preferred) or code (fallback)
      if (targetMunName) {
        const csvMunName = normalizeStr(row['NM_MUNICIPIO'] || '');
        if (csvMunName !== targetMunName) { skipped++; continue; }
      } else if (targetMunCode) {
        const csvMunCode = (row['CD_MUNICIPIO'] || '').replace(/^0+/, '');
        if (csvMunCode !== targetMunCode) { skipped++; continue; }
      } else {
        skipped++; continue;
      }

      const name = row['NM_VOTAVEL'] || '';
      if (!name) { skipped++; continue; }

      const isTenantCandidate = normalizeStr(name) === tenantNameNorm;
      candidatesSet.add(name);

      const candidateNum = row['NR_VOTAVEL'] || '';
      const party = row['SG_PARTIDO'] || partyFromNumber(candidateNum);

      batch.push({
        tenantId,
        electionYear: parseInt(row['ANO_ELEICAO']) || year,
        round: parseInt(row['NR_TURNO']) || 1,
        candidateName: name,
        candidateNumber: candidateNum || null,
        candidateParty: party,
        isTenantCandidate,
        zone: row['NR_ZONA'] || null,
        section: row['NR_SECAO'] || null,
        city: row['NM_MUNICIPIO'] || null,
        state: row['SG_UF'] || null,
        neighborhood: null,
        candidateVotes: parseInt(row['QT_VOTOS']) || 0,
        totalVotes: 0,
        party: party,
      });

      if (batch.length >= 500) {
        await this.insertBatch(batch);
        imported += batch.length;
        batch.length = 0;
        if (imported % 5000 === 0) logger.log(`Importados: ${imported} registros...`);
      }
    }

    if (batch.length > 0) {
      await this.insertBatch(batch);
      imported += batch.length;
    }

    try { fs.unlinkSync(tmpCsvPath); } catch (_) {}

    await this.recalcTotalVotes(tenantId);

    logger.log(`Importacao concluida: ${imported} registros, ${candidatesSet.size} candidatos`);

    return {
      imported,
      skipped,
      candidates: Array.from(candidatesSet).sort(),
    };
  }

  private downloadFile(url: string): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const protocol = url.startsWith('https') ? require('https') : require('http');
      protocol.get(url, { timeout: 120000 }, (res: any) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          return this.downloadFile(res.headers.location).then(resolve).catch(reject);
        }
        if (res.statusCode !== 200) {
          return reject(new Error(`TSE retornou status ${res.statusCode}`));
        }
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => resolve(Buffer.concat(chunks)));
        res.on('error', reject);
      }).on('error', reject);
    });
  }

  async clearTenantData(tenantId: string, electionYear?: number) {
    if (electionYear) {
      await this.dataSource.query(
        'DELETE FROM election_results WHERE "tenantId" = $1 AND "electionYear" = $2',
        [tenantId, electionYear],
      );
    } else {
      await this.dataSource.query(
        'DELETE FROM election_results WHERE "tenantId" = $1',
        [tenantId],
      );
    }
    return { message: 'Dados removidos com sucesso' };
  }
}
