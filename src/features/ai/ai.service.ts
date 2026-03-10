import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import axios from 'axios';
import {
  AiChatDto,
  AnalyzeElectionDto,
  CompareElectionsDto,
  SimulateScenarioDto,
  AnalyzeProjectionDto,
} from './dto/ai.dto';
import { Voter } from '../voters/voter.entity';
import { Leader } from '../leaders/leader.entity';
import { Visit } from '../visits/visit.entity';
import { HelpRecord } from '../help-records/help-record.entity';
import { Task } from '../tasks/task.entity';
import { PoliticalContact } from '../political-contacts/political-contact.entity';
import { Appointment } from '../appointments/appointment.entity';
import { StaffMember } from '../staff/staff.entity';
import { LawProject } from '../projects/project.entity';
import { LegislativeBill } from '../bills/bill.entity';
import { Amendment } from '../amendments/amendment.entity';
import { VotingRecord } from '../voting-records/voting-record.entity';

interface TenantContext {
  tenantName: string;
  politicalProfile: string;
  state: string;
  city?: string;
  party?: string;
}

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private readonly apiUrl: string;
  private readonly apiKey: string;
  private readonly model: string;

  constructor(
    private configService: ConfigService,
    @InjectRepository(Voter) private voterRepo: Repository<Voter>,
    @InjectRepository(Leader) private leaderRepo: Repository<Leader>,
    @InjectRepository(Visit) private visitRepo: Repository<Visit>,
    @InjectRepository(HelpRecord) private helpRecordRepo: Repository<HelpRecord>,
    @InjectRepository(Task) private taskRepo: Repository<Task>,
    @InjectRepository(PoliticalContact) private contactRepo: Repository<PoliticalContact>,
    @InjectRepository(Appointment) private appointmentRepo: Repository<Appointment>,
    @InjectRepository(StaffMember) private staffRepo: Repository<StaffMember>,
    @InjectRepository(LawProject) private projectRepo: Repository<LawProject>,
    @InjectRepository(LegislativeBill) private billRepo: Repository<LegislativeBill>,
    @InjectRepository(Amendment) private amendmentRepo: Repository<Amendment>,
    @InjectRepository(VotingRecord) private votingRecordRepo: Repository<VotingRecord>,
  ) {
    this.apiUrl = this.configService.get(
      'DEEPSEEK_API_URL',
      'https://api.deepseek.com/v1/chat/completions',
    );
    this.apiKey = this.configService.get('DEEPSEEK_API_KEY', '');
    this.model = this.configService.get('DEEPSEEK_MODEL', 'deepseek-chat');

    if (!this.apiKey) {
      this.logger.warn('DEEPSEEK_API_KEY não configurada!');
    }
  }

  private profileLabel(profile: string): string {
    const labels: Record<string, string> = {
      VEREADOR: 'Vereador',
      PREFEITO: 'Prefeito',
      VICE_PREFEITO: 'Vice-Prefeito',
      DEPUTADO_ESTADUAL: 'Deputado Estadual',
      DEPUTADO_FEDERAL: 'Deputado Federal',
      SENADOR: 'Senador',
      GOVERNADOR: 'Governador',
      VICE_GOVERNADOR: 'Vice-Governador',
      SECRETARIO: 'Secretário',
    };
    return labels[profile] || profile;
  }

  private locationLabel(ctx: TenantContext): string {
    if (ctx.city && ctx.state) return `${ctx.city} - ${ctx.state}`;
    if (ctx.state) return ctx.state;
    return 'Brasil';
  }

  async buildTenantDataSummary(tenantId: string): Promise<string> {
    const sections: string[] = [];

    try {
      // Eleitores
      const totalVoters = await this.voterRepo.count({ where: { tenantId } });
      if (totalVoters > 0) {
        const neighborhoodData = await this.voterRepo
          .createQueryBuilder('v')
          .select('v.neighborhood', 'neighborhood')
          .addSelect('COUNT(*)', 'count')
          .where('v.tenantId = :tenantId', { tenantId })
          .andWhere('v.neighborhood IS NOT NULL')
          .groupBy('v.neighborhood')
          .orderBy('count', 'DESC')
          .limit(10)
          .getRawMany();

        const supportData = await this.voterRepo
          .createQueryBuilder('v')
          .select('v.supportLevel', 'level')
          .addSelect('COUNT(*)', 'count')
          .where('v.tenantId = :tenantId', { tenantId })
          .andWhere('v.supportLevel IS NOT NULL')
          .groupBy('v.supportLevel')
          .getRawMany();

        const neighborhoodText = neighborhoodData.length > 0
          ? `Top bairros: ${neighborhoodData.map((n) => `${n.neighborhood} (${n.count})`).join(', ')}`
          : '';

        const supportText = supportData.length > 0
          ? `Nivel de apoio: ${supportData.map((s) => `${s.level}: ${s.count}`).join(', ')}`
          : '';

        sections.push(`ELEITORES: ${totalVoters} cadastrados. ${neighborhoodText}. ${supportText}`);
      }

      // Liderancas
      const totalLeaders = await this.leaderRepo.count({ where: { tenantId } });
      if (totalLeaders > 0) {
        const activeLeaders = await this.leaderRepo.count({ where: { tenantId, active: true } });
        const leaderData = await this.leaderRepo
          .createQueryBuilder('l')
          .select('l.name', 'name')
          .addSelect('l.region', 'region')
          .addSelect('l.votersCount', 'votersCount')
          .addSelect('l.votersGoal', 'votersGoal')
          .where('l.tenantId = :tenantId', { tenantId })
          .andWhere('l.active = true')
          .orderBy('l.votersCount', 'DESC')
          .limit(10)
          .getRawMany();

        const leaderText = leaderData.length > 0
          ? `Top liderancas: ${leaderData.map((l) => `${l.name} (${l.region || 'sem regiao'}, ${l.votersCount || 0}/${l.votersGoal || 0} eleitores)`).join('; ')}`
          : '';

        sections.push(`LIDERANCAS: ${totalLeaders} total, ${activeLeaders} ativas. ${leaderText}`);
      }

      // Visitas
      const totalVisits = await this.visitRepo.count({ where: { tenantId } });
      if (totalVisits > 0) {
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        const recentVisits = await this.visitRepo
          .createQueryBuilder('v')
          .where('v.tenantId = :tenantId', { tenantId })
          .andWhere('v.date >= :since', { since: thirtyDaysAgo })
          .getCount();

        sections.push(`VISITAS: ${totalVisits} total, ${recentVisits} nos ultimos 30 dias.`);
      }

      // Atendimentos
      const totalHelp = await this.helpRecordRepo.count({ where: { tenantId } });
      if (totalHelp > 0) {
        const statusData = await this.helpRecordRepo
          .createQueryBuilder('h')
          .select('h.status', 'status')
          .addSelect('COUNT(*)', 'count')
          .where('h.tenantId = :tenantId', { tenantId })
          .groupBy('h.status')
          .getRawMany();

        const typeData = await this.helpRecordRepo
          .createQueryBuilder('h')
          .select('h.type', 'type')
          .addSelect('COUNT(*)', 'count')
          .where('h.tenantId = :tenantId', { tenantId })
          .andWhere('h.type IS NOT NULL')
          .groupBy('h.type')
          .orderBy('count', 'DESC')
          .limit(5)
          .getRawMany();

        const statusText = statusData.map((s) => `${s.status}: ${s.count}`).join(', ');
        const categoryText = typeData.length > 0
          ? `Top tipos: ${typeData.map((c) => `${c.type} (${c.count})`).join(', ')}`
          : '';

        sections.push(`ATENDIMENTOS: ${totalHelp} total. Status: ${statusText}. ${categoryText}`);
      }

      // Tarefas
      const totalTasks = await this.taskRepo.count({ where: { tenantId } });
      if (totalTasks > 0) {
        const taskStatusData = await this.taskRepo
          .createQueryBuilder('t')
          .select('t.status', 'status')
          .addSelect('COUNT(*)', 'count')
          .where('t.tenantId = :tenantId', { tenantId })
          .groupBy('t.status')
          .getRawMany();

        const taskText = taskStatusData.map((t) => `${t.status}: ${t.count}`).join(', ');
        sections.push(`TAREFAS: ${totalTasks} total. ${taskText}`);
      }

      // Contatos Politicos
      const totalContacts = await this.contactRepo.count({ where: { tenantId } });
      if (totalContacts > 0) {
        const relationData = await this.contactRepo
          .createQueryBuilder('c')
          .select('c.relationship', 'relationship')
          .addSelect('COUNT(*)', 'count')
          .where('c.tenantId = :tenantId', { tenantId })
          .groupBy('c.relationship')
          .getRawMany();

        const roleData = await this.contactRepo
          .createQueryBuilder('c')
          .select('c.role', 'role')
          .addSelect('COUNT(*)', 'count')
          .where('c.tenantId = :tenantId', { tenantId })
          .groupBy('c.role')
          .orderBy('count', 'DESC')
          .getRawMany();

        const relationText = relationData.map((r) => `${r.relationship}: ${r.count}`).join(', ');
        const roleText = roleData.map((r) => `${r.role}: ${r.count}`).join(', ');
        sections.push(`CONTATOS POLITICOS: ${totalContacts} total. Relacao: ${relationText}. Cargos: ${roleText}`);
      }

      // Agenda
      const totalAppointments = await this.appointmentRepo.count({ where: { tenantId } });
      if (totalAppointments > 0) {
        const now = new Date();
        const upcoming = await this.appointmentRepo
          .createQueryBuilder('a')
          .where('a.tenantId = :tenantId', { tenantId })
          .andWhere('a.startDate >= :now', { now })
          .orderBy('a.startDate', 'ASC')
          .limit(5)
          .getMany();

        const upcomingText = upcoming.length > 0
          ? `Proximos compromissos: ${upcoming.map((a) => `${a.title} (${new Date(a.startDate).toLocaleDateString('pt-BR')})`).join('; ')}`
          : '';

        sections.push(`AGENDA: ${totalAppointments} compromissos. ${upcomingText}`);
      }

      // Equipe
      const totalStaff = await this.staffRepo.count({ where: { tenantId } });
      if (totalStaff > 0) {
        const activeStaff = await this.staffRepo.count({ where: { tenantId, active: true } });
        sections.push(`EQUIPE: ${totalStaff} membros, ${activeStaff} ativos.`);
      }

      // Projetos de Lei
      const totalProjects = await this.projectRepo.count({ where: { tenantId } });
      if (totalProjects > 0) {
        const projectStatusData = await this.projectRepo
          .createQueryBuilder('p')
          .select('p.status', 'status')
          .addSelect('COUNT(*)', 'count')
          .where('p.tenantId = :tenantId', { tenantId })
          .groupBy('p.status')
          .getRawMany();

        const projText = projectStatusData.map((p) => `${p.status}: ${p.count}`).join(', ');
        sections.push(`PROJETOS DE LEI: ${totalProjects} total. ${projText}`);
      }

      // Proposicoes
      const totalBills = await this.billRepo.count({ where: { tenantId } });
      if (totalBills > 0) {
        sections.push(`PROPOSICOES LEGISLATIVAS: ${totalBills} total.`);
      }

      // Emendas
      const totalAmendments = await this.amendmentRepo.count({ where: { tenantId } });
      if (totalAmendments > 0) {
        const amendmentSum = await this.amendmentRepo
          .createQueryBuilder('a')
          .select('SUM(a.value)', 'total')
          .where('a.tenantId = :tenantId', { tenantId })
          .getRawOne();

        const totalValue = amendmentSum?.total
          ? Number(amendmentSum.total).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
          : 'R$ 0';

        sections.push(`EMENDAS: ${totalAmendments} total, valor acumulado: ${totalValue}.`);
      }

      // Votacoes
      const totalVotingRecords = await this.votingRecordRepo.count({ where: { tenantId } });
      if (totalVotingRecords > 0) {
        const voteData = await this.votingRecordRepo
          .createQueryBuilder('v')
          .select('v.vote', 'vote')
          .addSelect('COUNT(*)', 'count')
          .where('v.tenantId = :tenantId', { tenantId })
          .groupBy('v.vote')
          .getRawMany();

        const voteText = voteData.map((v) => `${v.vote}: ${v.count}`).join(', ');
        sections.push(`VOTACOES: ${totalVotingRecords} registros. ${voteText}`);
      }
    } catch (error) {
      this.logger.error(`Erro ao coletar dados do tenant: ${error.message}`);
    }

    if (sections.length === 0) return '';

    return `\n\n=== DADOS DO GABINETE ===\n${sections.join('\n')}\n=== FIM DOS DADOS ===`;
  }

  async chat(dto: AiChatDto, tenant: TenantContext, tenantId?: string) {
    const profile = this.profileLabel(tenant.politicalProfile);
    const location = this.locationLabel(tenant);

    let contextData = '';
    if (dto.useContext && tenantId) {
      contextData = await this.buildTenantDataSummary(tenantId);
    }

    const systemPrompt = `Você é o assistente de inteligência eleitoral do Governe AI, especializado em análise política para ${profile} em ${location}. Responda sempre em português brasileiro, de forma objetiva e útil.${contextData ? `\n\nVocê tem acesso aos dados reais do gabinete do usuário. Use essas informações para dar respostas personalizadas e contextualizadas. Quando relevante, cite números e dados concretos do gabinete nas suas respostas.${contextData}` : ''}`;

    const messages: any[] = [{ role: 'system', content: systemPrompt }];

    if (dto.candidateContext) {
      const ctx = dto.candidateContext;
      messages.push({
        role: 'system',
        content: `Contexto do candidato: ${ctx.name || tenant.tenantName}, partido ${ctx.party || tenant.party || 'não informado'}, ${ctx.totalVotes ? ctx.totalVotes.toLocaleString('pt-BR') + ' votos' : ''}, ranking ${ctx.ranking || 'não disponível'}. ${ctx.topCities ? 'Top cidades: ' + JSON.stringify(ctx.topCities) : ''}`,
      });
    }

    if (dto.conversationHistory?.length) {
      const history = dto.conversationHistory.slice(-10);
      messages.push(...history);
    }

    messages.push({ role: 'user', content: dto.message });

    const response = await this.callDeepSeek(messages, 1024, 0.7);
    return { response };
  }

  async analyzeElection(dto: AnalyzeElectionDto, tenant: TenantContext) {
    const profile = this.profileLabel(tenant.politicalProfile);
    const location = this.locationLabel(tenant);

    const systemPrompt = `Você é um analista político sênior especializado em eleições brasileiras, com foco em eleições para ${profile} em ${location}. Responda sempre em português brasileiro, de forma objetiva e analítica. Use dados concretos quando possível.`;

    const competitorsText = dto.competitors?.length
      ? `\nConcorrentes:\n${dto.competitors.map((c, i) => `${i + 1}. ${c.name}: ${c.votes.toLocaleString('pt-BR')} votos`).join('\n')}`
      : '';

    const userPrompt = `Analise o desempenho eleitoral do candidato com os seguintes dados:
- Candidato: ${dto.candidateName}
- Partido: ${dto.party}
- Total de votos: ${dto.totalVotes.toLocaleString('pt-BR')}
- Ano: ${dto.year}
- Cargo: ${profile}
- Região: ${location}${competitorsText}

Responda em formato JSON com a estrutura:
{
  "analysis": "avaliação geral",
  "strengths": ["ponto forte 1", "ponto forte 2", "ponto forte 3"],
  "weaknesses": ["ponto fraco 1", "ponto fraco 2", "ponto fraco 3"],
  "opportunities": ["oportunidade 1", "oportunidade 2", "oportunidade 3"]
}`;

    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ];

    const response = await this.callDeepSeek(messages, 4000, 0.7);
    return this.parseJsonResponse(response, {
      analysis: response,
      strengths: [],
      weaknesses: [],
      opportunities: [],
    });
  }

  async compareElections(dto: CompareElectionsDto, tenant: TenantContext) {
    const profile = this.profileLabel(tenant.politicalProfile);
    const location = this.locationLabel(tenant);

    const variation =
      dto.election1.votes > 0
        ? (((dto.election2.votes - dto.election1.votes) / dto.election1.votes) * 100).toFixed(1)
        : '0';

    const systemPrompt = `Você é um analista político sênior especializado em eleições brasileiras para ${profile} em ${location}. Responda em português.`;

    const userPrompt = `Compare a evolução eleitoral do candidato:
- Candidato: ${dto.candidateName}
- ${dto.year1}: Partido ${dto.election1.party}, ${dto.election1.votes.toLocaleString('pt-BR')} votos, resultado: ${dto.election1.result}${dto.election1.municipalities?.length ? ', municípios: ' + dto.election1.municipalities.join(', ') : ''}
- ${dto.year2}: Partido ${dto.election2.party}, ${dto.election2.votes.toLocaleString('pt-BR')} votos, resultado: ${dto.election2.result}${dto.election2.municipalities?.length ? ', municípios: ' + dto.election2.municipalities.join(', ') : ''}
- Variação de votos: ${variation}%

Responda em formato JSON:
{
  "comparison": "análise comparativa detalhada",
  "evolution": "tendência do candidato",
  "recommendations": ["recomendação 1", "recomendação 2", "recomendação 3"]
}`;

    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ];

    const response = await this.callDeepSeek(messages, 4000, 0.7);
    return this.parseJsonResponse(response, {
      comparison: response,
      evolution: '',
      recommendations: [],
    });
  }

  async simulateScenario(dto: SimulateScenarioDto, tenant: TenantContext) {
    const profile = this.profileLabel(tenant.politicalProfile);
    const location = this.locationLabel(tenant);

    const systemPrompt = `Você é um estrategista eleitoral com expertise em simulação de cenários políticos para eleições de ${profile} em ${location}. Utilize dados realistas e projeções baseadas em padrões históricos eleitorais. Responda em português.`;

    const citiesText = dto.topCities?.length
      ? `\nTop cidades:\n${dto.topCities.map((c) => `- ${c.city}: ${c.votes.toLocaleString('pt-BR')} votos`).join('\n')}`
      : '';

    const userPrompt = `Simule o seguinte cenário eleitoral:
- Candidato: ${dto.candidateName}
- Partido: ${dto.party}
- Votos atuais: ${dto.currentVotes.toLocaleString('pt-BR')}
- Cenário: ${dto.scenarioName}
- Detalhes: ${dto.scenarioDetails}${citiesText}

Responda em formato JSON:
{
  "projectedVotes": número,
  "confidenceLevel": "Alta|Média|Baixa",
  "analysis": "análise detalhada do cenário",
  "cityProjections": [{"city": "nome", "currentVotes": número, "projectedVotes": número, "change": "+X%"}],
  "strategies": ["estratégia 1", "estratégia 2", "estratégia 3"]
}`;

    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ];

    const response = await this.callDeepSeek(messages, 4000, 0.7);
    return this.parseJsonResponse(response, {
      projectedVotes: 0,
      confidenceLevel: 'Média',
      analysis: response,
      cityProjections: [],
      strategies: [],
    });
  }

  async analyzeProjection(dto: AnalyzeProjectionDto, tenant: TenantContext) {
    const profile = this.profileLabel(tenant.politicalProfile);
    const location = this.locationLabel(tenant);

    const systemPrompt = `Você é um consultor político especialista em estratégias eleitorais em ${location}. Analise os dados de projeção eleitoral fornecidos e gere uma análise estratégica CONCISA e PRÁTICA. Responda SEMPRE em português brasileiro. Use no máximo 4 parágrafos. Seja direto e objetivo. Inclua: diagnóstico da situação, pontos fortes, pontos fracos e recomendações práticas de ação.`;

    const citiesText = dto.cityResults?.length
      ? `\nResultados por cidade:\n${dto.cityResults.map((c) => `- ${c.city}: ${c.currentVotes.toLocaleString('pt-BR')} → ${c.projectedVotes.toLocaleString('pt-BR')} (${c.percentChange})`).join('\n')}`
      : '';

    const userPrompt = `Dados de projeção eleitoral para ${profile}:
- Candidato: ${dto.candidateName} (${dto.party}${dto.number ? ' - ' + dto.number : ''})
- Votos atuais: ${dto.currentVotes.toLocaleString('pt-BR')}
- Votos projetados: ${dto.projectedVotes.toLocaleString('pt-BR')}
- Ranking atual: ${dto.currentRanking}º → Projetado: ${dto.projectedRanking}º (${dto.rankingChange > 0 ? '+' : ''}${dto.rankingChange} posições)
${dto.goalVotes ? `- Meta de votos: ${dto.goalVotes.toLocaleString('pt-BR')} (${dto.goalProgress?.toFixed(1)}% alcançado)` : ''}
${dto.scenarioName ? `- Cenário: ${dto.scenarioName}` : ''}${citiesText}`;

    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ];

    const response = await this.callDeepSeek(messages, 600, 0.7);
    return { analysis: response };
  }

  private async callDeepSeek(
    messages: any[],
    maxTokens: number,
    temperature: number,
  ): Promise<string> {
    try {
      const { data } = await axios.post(
        this.apiUrl,
        {
          model: this.model,
          messages,
          max_tokens: maxTokens,
          temperature,
        },
        {
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.apiKey}`,
          },
          timeout: 60000,
        },
      );

      return data.choices[0]?.message?.content || '';
    } catch (error: any) {
      this.logger.error(
        `DeepSeek API error: ${error.response?.data?.error?.message || error.message}`,
      );
      throw new Error('Erro ao processar solicitação de IA. Tente novamente.');
    }
  }

  private parseJsonResponse(response: string, fallback: any): any {
    try {
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
    } catch {
      this.logger.warn('Failed to parse JSON from AI response, using fallback');
    }
    return fallback;
  }
}
