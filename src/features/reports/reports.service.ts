import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import {
  GenerateReportDto,
  ReportType,
  ReportFormat,
} from './dto/generate-report.dto';

interface ColumnDef {
  column: string;
  label: string;
}

const REPORT_COLUMNS: Record<ReportType, { table: string; columns: ColumnDef[] }> = {
  [ReportType.VOTERS]: {
    table: 'voters',
    columns: [
      { column: 'name', label: 'Nome' },
      { column: 'cpf', label: 'CPF' },
      { column: 'phone', label: 'Telefone' },
      { column: 'email', label: 'E-mail' },
      { column: 'birthDate', label: 'Data de Nascimento' },
      { column: 'gender', label: 'Genero' },
      { column: 'address', label: 'Endereco' },
      { column: 'neighborhood', label: 'Bairro' },
      { column: 'city', label: 'Cidade' },
      { column: 'state', label: 'Estado' },
      { column: 'zipCode', label: 'CEP' },
      { column: 'voterRegistration', label: 'Titulo de Eleitor' },
      { column: 'votingZone', label: 'Zona Eleitoral' },
      { column: 'votingSection', label: 'Secao Eleitoral' },
      { column: 'tags', label: 'Tags' },
      { column: 'notes', label: 'Observacoes' },
      { column: 'createdAt', label: 'Data de Cadastro' },
    ],
  },
  [ReportType.LEADERS]: {
    table: 'leaders',
    columns: [
      { column: 'name', label: 'Nome' },
      { column: 'phone', label: 'Telefone' },
      { column: 'email', label: 'E-mail' },
      { column: 'neighborhood', label: 'Bairro' },
      { column: 'city', label: 'Cidade' },
      { column: 'state', label: 'Estado' },
      { column: 'voterCount', label: 'Qtd Eleitores' },
      { column: 'notes', label: 'Observacoes' },
      { column: 'createdAt', label: 'Data de Cadastro' },
    ],
  },
  [ReportType.HELP_RECORDS]: {
    table: 'help_records',
    columns: [
      { column: 'title', label: 'Titulo' },
      { column: 'description', label: 'Descricao' },
      { column: 'category', label: 'Categoria' },
      { column: 'status', label: 'Status' },
      { column: 'requesterName', label: 'Solicitante' },
      { column: 'requesterPhone', label: 'Telefone Solicitante' },
      { column: 'notes', label: 'Observacoes' },
      { column: 'createdAt', label: 'Data de Abertura' },
    ],
  },
  [ReportType.VISITS]: {
    table: 'visits',
    columns: [
      { column: 'title', label: 'Titulo' },
      { column: 'description', label: 'Descricao' },
      { column: 'address', label: 'Endereco' },
      { column: 'neighborhood', label: 'Bairro' },
      { column: 'city', label: 'Cidade' },
      { column: 'visitDate', label: 'Data da Visita' },
      { column: 'status', label: 'Status' },
      { column: 'notes', label: 'Observacoes' },
      { column: 'createdAt', label: 'Data de Cadastro' },
    ],
  },
  [ReportType.TASKS]: {
    table: 'tasks',
    columns: [
      { column: 'title', label: 'Titulo' },
      { column: 'description', label: 'Descricao' },
      { column: 'priority', label: 'Prioridade' },
      { column: 'status', label: 'Status' },
      { column: 'dueDate', label: 'Data de Vencimento' },
      { column: 'createdAt', label: 'Data de Criacao' },
    ],
  },
  [ReportType.APPOINTMENTS]: {
    table: 'appointments',
    columns: [
      { column: 'title', label: 'Titulo' },
      { column: 'description', label: 'Descricao' },
      { column: 'type', label: 'Tipo' },
      { column: 'status', label: 'Status' },
      { column: 'startDate', label: 'Inicio' },
      { column: 'endDate', label: 'Fim' },
      { column: 'location', label: 'Local' },
      { column: 'createdAt', label: 'Data de Cadastro' },
    ],
  },
  [ReportType.BILLS]: {
    table: 'legislative_bills',
    columns: [
      { column: 'title', label: 'Titulo' },
      { column: 'description', label: 'Descricao' },
      { column: 'billType', label: 'Tipo' },
      { column: 'number', label: 'Numero' },
      { column: 'year', label: 'Ano' },
      { column: 'authorship', label: 'Autoria' },
      { column: 'status', label: 'Status' },
      { column: 'presentedAt', label: 'Data de Apresentacao' },
      { column: 'createdAt', label: 'Data de Cadastro' },
    ],
  },
  [ReportType.AMENDMENTS]: {
    table: 'amendments',
    columns: [
      { column: 'title', label: 'Titulo' },
      { column: 'description', label: 'Descricao' },
      { column: 'number', label: 'Numero' },
      { column: 'year', label: 'Ano' },
      { column: 'value', label: 'Valor' },
      { column: 'status', label: 'Status' },
      { column: 'beneficiary', label: 'Beneficiario' },
      { column: 'city', label: 'Cidade' },
      { column: 'state', label: 'Estado' },
      { column: 'createdAt', label: 'Data de Cadastro' },
    ],
  },
  [ReportType.CEAP]: {
    table: 'ceap_expenses',
    columns: [
      { column: 'type', label: 'Tipo' },
      { column: 'status', label: 'Status' },
      { column: 'description', label: 'Descricao' },
      { column: 'category', label: 'Categoria' },
      { column: 'value', label: 'Valor' },
      { column: 'date', label: 'Data' },
      { column: 'supplier', label: 'Fornecedor' },
      { column: 'supplierCnpj', label: 'CNPJ Fornecedor' },
      { column: 'createdAt', label: 'Data de Cadastro' },
    ],
  },
  [ReportType.EXECUTIVE_REQUESTS]: {
    table: 'executive_requests',
    columns: [
      { column: 'title', label: 'Titulo' },
      { column: 'description', label: 'Descricao' },
      { column: 'requestType', label: 'Tipo' },
      { column: 'status', label: 'Status' },
      { column: 'recipientName', label: 'Destinatario' },
      { column: 'recipientRole', label: 'Cargo Destinatario' },
      { column: 'sentAt', label: 'Data de Envio' },
      { column: 'respondedAt', label: 'Data de Resposta' },
      { column: 'createdAt', label: 'Data de Cadastro' },
    ],
  },
  [ReportType.ELECTION_RESULTS]: {
    table: 'election_results',
    columns: [
      { column: 'year', label: 'Ano' },
      { column: 'round', label: 'Turno' },
      { column: 'state', label: 'Estado' },
      { column: 'city', label: 'Cidade' },
      { column: 'cargo', label: 'Cargo' },
      { column: 'createdAt', label: 'Data de Cadastro' },
    ],
  },
  [ReportType.POLITICAL_CONTACTS]: {
    table: 'political_contacts',
    columns: [
      { column: 'name', label: 'Nome' },
      { column: 'role', label: 'Cargo' },
      { column: 'party', label: 'Partido' },
      { column: 'phone', label: 'Telefone' },
      { column: 'email', label: 'E-mail' },
      { column: 'city', label: 'Cidade' },
      { column: 'state', label: 'Estado' },
      { column: 'relationship', label: 'Relacionamento' },
      { column: 'notes', label: 'Observacoes' },
      { column: 'createdAt', label: 'Data de Cadastro' },
    ],
  },
  [ReportType.STAFF]: {
    table: 'staff_members',
    columns: [
      { column: 'name', label: 'Nome' },
      { column: 'role', label: 'Cargo' },
      { column: 'phone', label: 'Telefone' },
      { column: 'email', label: 'E-mail' },
      { column: 'department', label: 'Departamento' },
      { column: 'startDate', label: 'Data de Inicio' },
      { column: 'notes', label: 'Observacoes' },
      { column: 'createdAt', label: 'Data de Cadastro' },
    ],
  },
  [ReportType.GENERAL]: {
    table: 'voters',
    columns: [
      { column: 'name', label: 'Nome' },
      { column: 'phone', label: 'Telefone' },
      { column: 'email', label: 'E-mail' },
      { column: 'city', label: 'Cidade' },
      { column: 'supportLevel', label: 'Nivel de Apoio' },
      { column: 'createdAt', label: 'Data de Cadastro' },
    ],
  },
};

@Injectable()
export class ReportsService {
  constructor(private dataSource: DataSource) {}

  async generate(tenantId: string, dto: GenerateReportDto) {
    const config = REPORT_COLUMNS[dto.type];
    const data = await this.queryData(tenantId, dto, config);

    if (dto.format === ReportFormat.CSV) {
      const csv = this.toCsv(data, config.columns);
      return { csv, filename: `${dto.type.toLowerCase()}_relatorio.csv` };
    }

    return {
      type: dto.type,
      generatedAt: new Date().toISOString(),
      totalRecords: data.length,
      data,
    };
  }

  async getSummary(tenantId: string) {
    const tables: Record<string, string> = {
      voters: 'voters',
      leaders: 'leaders',
      helpRecords: 'help_records',
      visits: 'visits',
      tasks: 'tasks',
      appointments: 'appointments',
      bills: 'legislative_bills',
      amendments: 'amendments',
      ceapExpenses: 'ceap_expenses',
      executiveRequests: 'executive_requests',
      electionResults: 'election_results',
      politicalContacts: 'political_contacts',
      staffMembers: 'staff_members',
    };

    const counts: Record<string, number> = {};

    for (const [key, table] of Object.entries(tables)) {
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

    return counts;
  }

  private async queryData(
    tenantId: string,
    dto: GenerateReportDto,
    config: { table: string; columns: ColumnDef[] },
  ) {
    const selectCols = config.columns
      .map((c) => `"${c.column}"`)
      .join(', ');

    let query = `SELECT ${selectCols} FROM "${config.table}" WHERE "tenantId" = $1`;
    const params: any[] = [tenantId];

    if (dto.startDate) {
      params.push(dto.startDate);
      query += ` AND "createdAt" >= $${params.length}`;
    }

    if (dto.endDate) {
      params.push(dto.endDate);
      query += ` AND "createdAt" <= $${params.length}`;
    }

    query += ' ORDER BY "createdAt" DESC LIMIT 5000';

    try {
      return await this.dataSource.query(query, params);
    } catch {
      return [];
    }
  }

  private toCsv(data: any[], columns: ColumnDef[]): string {
    if (data.length === 0) return '';

    const headers = columns.map((c) => c.label);
    const keys = columns.map((c) => c.column);

    const lines = [
      headers.join(','),
      ...data.map((row) =>
        keys
          .map((key) => {
            const val = row[key];
            if (val === null || val === undefined) return '';
            const str = Array.isArray(val) ? val.join('; ') : String(val);
            return str.includes(',') || str.includes('"') || str.includes('\n')
              ? `"${str.replace(/"/g, '""')}"`
              : str;
          })
          .join(','),
      ),
    ];

    return lines.join('\n');
  }
}
