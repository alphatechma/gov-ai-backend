import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as XLSX from 'xlsx';
import * as ExcelJS from 'exceljs';
import { HelpRecord } from './help-record.entity';
import { HelpType } from './help-type.entity';
import { TenantAwareService } from '../../shared/base/tenant-aware.service';

@Injectable()
export class HelpRecordsService extends TenantAwareService<HelpRecord> {
  constructor(
    @InjectRepository(HelpRecord) repo: Repository<HelpRecord>,
    @InjectRepository(HelpType) private typeRepo: Repository<HelpType>,
  ) {
    super(repo);
  }

  async findAllTypes(tenantId: string): Promise<HelpType[]> {
    return this.typeRepo.find({ where: { tenantId }, order: { name: 'ASC' } });
  }

  async createType(tenantId: string, name: string): Promise<HelpType> {
    const entity = this.typeRepo.create({ tenantId, name });
    return this.typeRepo.save(entity);
  }

  async removeType(tenantId: string, id: string): Promise<void> {
    await this.typeRepo.delete({ id, tenantId });
  }

  async findAllPaginated(
    tenantId: string,
    filters: {
      page?: number; limit?: number; search?: string; type?: string;
      status?: string; neighborhood?: string; dateFrom?: string; dateTo?: string;
    },
  ): Promise<{ data: any[]; total: number; page: number; limit: number }> {
    const page = Math.max(1, filters.page || 1);
    const limit = Math.min(200, Math.max(1, filters.limit || 50));
    const offset = (page - 1) * limit;

    const qb = this.repository
      .createQueryBuilder('h')
      .leftJoin('voters', 'v', 'v.id = h.voterId')
      .addSelect('v.name', 'voterName')
      .addSelect('v.neighborhood', 'voterNeighborhood')
      .where('h.tenantId = :tenantId', { tenantId });

    if (filters.search) {
      qb.andWhere('(h.type ILIKE :q OR h.observations ILIKE :q)', { q: `%${filters.search}%` });
    }
    if (filters.type) {
      qb.andWhere('h.type = :type', { type: filters.type });
    }
    if (filters.status) {
      qb.andWhere('h.status = :status', { status: filters.status });
    }
    if (filters.neighborhood) {
      qb.andWhere('v.neighborhood = :neighborhood', { neighborhood: filters.neighborhood });
    }
    if (filters.dateFrom) {
      qb.andWhere('COALESCE(h.date, CAST(h.createdAt AS date)) >= :dateFrom', { dateFrom: filters.dateFrom });
    }
    if (filters.dateTo) {
      qb.andWhere('COALESCE(h.date, CAST(h.createdAt AS date)) <= :dateTo', { dateTo: filters.dateTo });
    }

    qb.orderBy('h.createdAt', 'DESC');

    // Get total count
    const countQb = qb.clone();
    const totalResult = await countQb.select('COUNT(*)', 'count').getRawOne();
    const total = parseInt(totalResult?.count ?? '0', 10);

    // Get paginated data with voter info
    const rawData = await qb
      .select([
        'h.id AS id',
        'h.tenantId AS "tenantId"',
        'h.voterId AS "voterId"',
        'h.type AS type',
        'h.category AS category',
        'h.status AS status',
        'h.observations AS observations',
        'h.resolution AS resolution',
        'h.responsibleId AS "responsibleId"',
        'h.leaderId AS "leaderId"',
        'h.date AS date',
        'h.documents AS documents',
        'h.createdAt AS "createdAt"',
        'h.updatedAt AS "updatedAt"',
        'v.name AS "voterName"',
        'v.neighborhood AS "voterNeighborhood"',
      ])
      .offset(offset)
      .limit(limit)
      .getRawMany();

    return { data: rawData, total, page, limit };
  }

  async getListStats(
    tenantId: string,
    filters: {
      search?: string; type?: string; status?: string;
      neighborhood?: string; dateFrom?: string; dateTo?: string;
    },
  ): Promise<{
    total: number; pending: number; inProgress: number;
    completed: number; cancelled: number;
    types: { name: string; count: number }[];
    bairros: string[];
  }> {
    const baseQb = () => {
      const qb = this.repository
        .createQueryBuilder('h')
        .leftJoin('voters', 'v', 'v.id = h.voterId')
        .where('h.tenantId = :tenantId', { tenantId });

      if (filters.search) {
        qb.andWhere('(h.type ILIKE :q OR h.observations ILIKE :q)', { q: `%${filters.search}%` });
      }
      if (filters.type) {
        qb.andWhere('h.type = :type', { type: filters.type });
      }
      if (filters.status) {
        qb.andWhere('h.status = :status', { status: filters.status });
      }
      if (filters.neighborhood) {
        qb.andWhere('v.neighborhood = :neighborhood', { neighborhood: filters.neighborhood });
      }
      if (filters.dateFrom) {
        qb.andWhere('COALESCE(h.date, CAST(h.createdAt AS date)) >= :dateFrom', { dateFrom: filters.dateFrom });
      }
      if (filters.dateTo) {
        qb.andWhere('COALESCE(h.date, CAST(h.createdAt AS date)) <= :dateTo', { dateTo: filters.dateTo });
      }
      return qb;
    };

    const [totalResult, pendingResult, inProgressResult, completedResult, cancelledResult, typesResult, bairrosResult] =
      await Promise.all([
        baseQb().select('COUNT(*)', 'count').getRawOne(),
        baseQb().andWhere("h.status = 'PENDING'").select('COUNT(*)', 'count').getRawOne(),
        baseQb().andWhere("h.status = 'IN_PROGRESS'").select('COUNT(*)', 'count').getRawOne(),
        baseQb().andWhere("h.status = 'COMPLETED'").select('COUNT(*)', 'count').getRawOne(),
        baseQb().andWhere("h.status = 'CANCELLED'").select('COUNT(*)', 'count').getRawOne(),
        baseQb()
          .select('h.type', 'name')
          .addSelect('COUNT(*)', 'count')
          .andWhere("h.type IS NOT NULL AND h.type != ''")
          .groupBy('h.type')
          .orderBy('count', 'DESC')
          .getRawMany(),
        baseQb()
          .select('DISTINCT v.neighborhood', 'neighborhood')
          .andWhere("v.neighborhood IS NOT NULL AND v.neighborhood != ''")
          .orderBy('v.neighborhood', 'ASC')
          .getRawMany(),
      ]);

    return {
      total: parseInt(totalResult?.count ?? '0', 10),
      pending: parseInt(pendingResult?.count ?? '0', 10),
      inProgress: parseInt(inProgressResult?.count ?? '0', 10),
      completed: parseInt(completedResult?.count ?? '0', 10),
      cancelled: parseInt(cancelledResult?.count ?? '0', 10),
      types: typesResult.map((r: any) => ({ name: r.name, count: parseInt(r.count, 10) })),
      bairros: bairrosResult.map((r: any) => r.neighborhood),
    };
  }

  async importFromExcel(tenantId: string, buffer: Buffer) {
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    if (!sheet) throw new BadRequestException('Planilha vazia');

    const rows = XLSX.utils.sheet_to_json<Record<string, any>>(sheet);
    if (rows.length === 0) throw new BadRequestException('Nenhum registro encontrado na planilha');

    const COLUMN_MAP: Record<string, string> = {
      'tipo': 'type',
      'tipo de atendimento': 'type',
      'categoria': 'category',
      'data': 'date',
      'data do atendimento': 'date',
      'observacoes': 'observations',
      'observações': 'observations',
      'status': 'status',
      'eleitor': 'voterName',
      'nome do eleitor': 'voterName',
      'lideranca': 'leaderName',
      'liderança': 'leaderName',
      'lideranca responsavel': 'leaderName',
      'liderança responsável': 'leaderName',
    };

    const STATUS_MAP: Record<string, string> = {
      'pendente': 'PENDING',
      'em andamento': 'IN_PROGRESS',
      'concluido': 'COMPLETED',
      'concluído': 'COMPLETED',
      'cancelado': 'CANCELLED',
    };

    // Pre-load voters and leaders for name matching
    const voters = await this.repository.manager.query(
      `SELECT id, name FROM voters WHERE "tenantId" = $1`,
      [tenantId],
    );
    const voterByName = new Map<string, string>();
    for (const v of voters) voterByName.set(v.name.toLowerCase().trim(), v.id);

    const leaders = await this.repository.manager.query(
      `SELECT id, name FROM leaders WHERE "tenantId" = $1`,
      [tenantId],
    );
    const leaderByName = new Map<string, string>();
    for (const l of leaders) leaderByName.set(l.name.toLowerCase().trim(), l.id);

    // Pre-load existing help types to auto-create new ones
    const existingTypes = await this.typeRepo.find({ where: { tenantId } });
    const typeSet = new Set(existingTypes.map((t) => t.name.toLowerCase()));

    let imported = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const mapped: Record<string, any> = {};

      for (const [header, value] of Object.entries(row)) {
        const key = COLUMN_MAP[header.toLowerCase().trim()];
        if (key && value !== null && value !== undefined && String(value).trim() !== '') {
          mapped[key] = String(value).trim();
        }
      }

      if (!mapped.type) {
        skipped++;
        errors.push(`Linha ${i + 2}: tipo de atendimento obrigatorio`);
        continue;
      }

      // Handle date (Excel serial or DD/MM/YYYY)
      if (mapped.date) {
        const num = Number(mapped.date);
        if (!isNaN(num) && num > 10000) {
          const date = XLSX.SSF.parse_date_code(num);
          if (date) {
            mapped.date = `${date.y}-${String(date.m).padStart(2, '0')}-${String(date.d).padStart(2, '0')}`;
          }
        } else {
          const parts = mapped.date.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
          if (parts) {
            mapped.date = `${parts[3]}-${parts[2].padStart(2, '0')}-${parts[1].padStart(2, '0')}`;
          }
        }
      }

      // Map status label to enum
      if (mapped.status) {
        const normalized = STATUS_MAP[mapped.status.toLowerCase()];
        mapped.status = normalized || 'PENDING';
      }

      // Match voter by name
      if (mapped.voterName) {
        const voterId = voterByName.get(mapped.voterName.toLowerCase());
        if (voterId) mapped.voterId = voterId;
        delete mapped.voterName;
      }

      // Match leader by name
      if (mapped.leaderName) {
        const leaderId = leaderByName.get(mapped.leaderName.toLowerCase());
        if (leaderId) mapped.leaderId = leaderId;
        delete mapped.leaderName;
      }

      // Auto-create help type if new
      if (!typeSet.has(mapped.type.toLowerCase())) {
        await this.createType(tenantId, mapped.type);
        typeSet.add(mapped.type.toLowerCase());
      }

      try {
        await this.create(tenantId, mapped as any);
        imported++;
      } catch {
        skipped++;
        errors.push(`Linha ${i + 2}: erro ao salvar atendimento "${mapped.type}"`);
      }
    }

    return { imported, skipped, total: rows.length, errors: errors.slice(0, 20) };
  }

  async exportToExcel(
    tenantId: string,
    filters: { search?: string; type?: string; status?: string; neighborhood?: string; dateFrom?: string; dateTo?: string },
  ): Promise<Buffer> {
    const qb = this.repository
      .createQueryBuilder('h')
      .where('h.tenantId = :tenantId', { tenantId })
      .orderBy('h.createdAt', 'DESC');

    if (filters.search) {
      qb.andWhere('(h.type ILIKE :q OR h.observations ILIKE :q)', { q: `%${filters.search}%` });
    }
    if (filters.type) {
      qb.andWhere('h.type = :type', { type: filters.type });
    }
    if (filters.status) {
      qb.andWhere('h.status = :status', { status: filters.status });
    }
    if (filters.dateFrom) {
      qb.andWhere('COALESCE(h.date, CAST(h.createdAt AS date)) >= :dateFrom', { dateFrom: filters.dateFrom });
    }
    if (filters.dateTo) {
      qb.andWhere('COALESCE(h.date, CAST(h.createdAt AS date)) <= :dateTo', { dateTo: filters.dateTo });
    }

    let records = await qb.getMany();

    // Load voters for name + bairro mapping
    const voters = await this.repository.manager.query(
      `SELECT id, name, neighborhood FROM voters WHERE "tenantId" = $1`,
      [tenantId],
    );
    const voterMap = new Map<string, { name: string; neighborhood: string }>();
    for (const v of voters) voterMap.set(v.id, { name: v.name, neighborhood: v.neighborhood });

    // Load leaders for name mapping
    const leaders = await this.repository.manager.query(
      `SELECT id, name FROM leaders WHERE "tenantId" = $1`,
      [tenantId],
    );
    const leaderMap = new Map<string, string>();
    for (const l of leaders) leaderMap.set(l.id, l.name);

    // Filter by neighborhood (cross-ref voter)
    if (filters.neighborhood) {
      records = records.filter((h) => {
        if (!h.voterId) return false;
        const voter = voterMap.get(h.voterId);
        return voter?.neighborhood === filters.neighborhood;
      });
    }

    const STATUS_LABELS: Record<string, string> = {
      PENDING: 'Pendente',
      IN_PROGRESS: 'Em Andamento',
      COMPLETED: 'Concluido',
      CANCELLED: 'Cancelado',
    };

    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Atendimentos');

    const headers = ['Data', 'Tipo', 'Categoria', 'Status', 'Eleitor', 'Bairro', 'Lideranca', 'Observacoes', 'Resolucao'];
    const widths = [14, 25, 20, 16, 30, 20, 25, 40, 40];

    ws.columns = headers.map((header, i) => ({ header, width: widths[i] }));

    const headerRow = ws.getRow(1);
    headerRow.eachCell((cell) => {
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4A4A4A' } };
      cell.alignment = { horizontal: 'center' };
    });

    for (const h of records) {
      const voter = h.voterId ? voterMap.get(h.voterId) : null;
      ws.addRow([
        h.date ?? (h.createdAt ? String(h.createdAt).slice(0, 10) : ''),
        h.type ?? '',
        h.category ?? '',
        STATUS_LABELS[h.status] ?? h.status,
        voter?.name ?? '',
        voter?.neighborhood ?? '',
        h.leaderId ? (leaderMap.get(h.leaderId) ?? '') : '',
        h.observations ?? '',
        h.resolution ?? '',
      ]);
    }

    const arrayBuffer = await wb.xlsx.writeBuffer();
    return Buffer.from(arrayBuffer);
  }

  async generateTemplate(): Promise<Buffer> {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Atendimentos');

    const headers = ['Tipo', 'Categoria', 'Data', 'Status', 'Eleitor', 'Lideranca', 'Observacoes'];
    const widths = [25, 20, 14, 16, 30, 25, 40];

    ws.columns = headers.map((header, i) => ({ header, width: widths[i] }));

    const headerRow = ws.getRow(1);
    headerRow.eachCell((cell) => {
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4A4A4A' } };
      cell.alignment = { horizontal: 'center' };
    });

    const arrayBuffer = await wb.xlsx.writeBuffer();
    return Buffer.from(arrayBuffer);
  }
}
