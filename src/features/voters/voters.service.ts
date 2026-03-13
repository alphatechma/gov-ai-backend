import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DeepPartial } from 'typeorm';
import { Voter } from './voter.entity';
import { Leader } from '../leaders/leader.entity';
import { TenantAwareService } from '../../shared/base/tenant-aware.service';
import { GeocodingService } from '../../shared/services/geocoding.service';
import * as XLSX from 'xlsx';
import * as ExcelJS from 'exceljs';

@Injectable()
export class VotersService extends TenantAwareService<Voter> {
  private readonly logger = new Logger(VotersService.name);

  constructor(
    @InjectRepository(Voter)
    private votersRepo: Repository<Voter>,
    @InjectRepository(Leader)
    private leadersRepo: Repository<Leader>,
    private geocodingService: GeocodingService,
  ) {
    super(votersRepo);
  }

  async create(tenantId: string, dto: DeepPartial<Voter>) {
    // Geocodificar se não veio com coordenadas e tem dados de endereço
    if (!dto.latitude && !dto.longitude) {
      const hasAddress = dto.address || dto.neighborhood || dto.city;
      if (hasAddress) {
        const geo = await this.geocodingService.geocode({
          address: dto.address as string,
          neighborhood: dto.neighborhood as string,
          city: dto.city as string,
          state: dto.state as string,
          zipCode: dto.zipCode as string,
        });
        if (geo) {
          dto.latitude = geo.latitude;
          dto.longitude = geo.longitude;
        }
      }
    }
    const voter = await super.create(tenantId, dto);
    if (voter.leaderId) {
      await this.syncLeaderVotersCount(voter.leaderId);
    }
    return voter;
  }

  async update(tenantId: string, id: string, dto: DeepPartial<Voter>) {
    // Re-geocodificar se campos de endereço mudaram e não vieram coordenadas novas
    const addressFieldChanged =
      dto.address !== undefined ||
      dto.neighborhood !== undefined ||
      dto.city !== undefined ||
      dto.state !== undefined ||
      dto.zipCode !== undefined;

    if (addressFieldChanged && dto.latitude === undefined) {
      const existing = await this.findOne(tenantId, id);
      const address =
        dto.address !== undefined ? dto.address : existing.address;
      const neighborhood =
        dto.neighborhood !== undefined
          ? dto.neighborhood
          : existing.neighborhood;
      const city = dto.city !== undefined ? dto.city : existing.city;
      const state = dto.state !== undefined ? dto.state : existing.state;
      const zipCode =
        dto.zipCode !== undefined ? dto.zipCode : existing.zipCode;

      if (address || neighborhood || city) {
        const geo = await this.geocodingService.geocode({
          address,
          neighborhood,
          city,
          state,
          zipCode,
        });
        if (geo) {
          dto.latitude = geo.latitude;
          dto.longitude = geo.longitude;
        }
      }
    }
    // Capturar leaderId antigo antes do update
    const oldLeaderId = dto.leaderId !== undefined
      ? (await this.findOne(tenantId, id)).leaderId
      : null;

    const voter = await super.update(tenantId, id, dto);

    // Sincronizar contadores se leaderId mudou
    if (dto.leaderId !== undefined) {
      if (oldLeaderId) await this.syncLeaderVotersCount(oldLeaderId);
      if (voter.leaderId && voter.leaderId !== oldLeaderId) {
        await this.syncLeaderVotersCount(voter.leaderId);
      }
    }

    return voter;
  }

  async remove(tenantId: string, id: string) {
    const voter = await this.findOne(tenantId, id);
    const { leaderId } = voter;
    const result = await super.remove(tenantId, id);
    if (leaderId) {
      await this.syncLeaderVotersCount(leaderId);
    }
    return result;
  }

  private async syncLeaderVotersCount(leaderId: string) {
    await this.leadersRepo.query(
      `UPDATE leaders SET "votersCount" = (
        SELECT COUNT(*) FROM voters WHERE "leaderId" = $1::text
      ) WHERE id = $1::uuid`,
      [leaderId],
    );
  }

  async getHeatmapData(tenantId: string) {
    return this.votersRepo
      .createQueryBuilder('v')
      .select([
        'v.latitude',
        'v.longitude',
        'v.name',
        'v.neighborhood',
        'v.city',
        'v.state',
        'v.supportLevel',
      ])
      .where('v.tenantId = :tenantId', { tenantId })
      .andWhere('v.latitude IS NOT NULL')
      .andWhere('v.longitude IS NOT NULL')
      .getMany();
  }

  async getHeatmapAggregated(
    tenantId: string,
    groupBy: 'neighborhood' | 'city' | 'state',
  ) {
    const qb = this.votersRepo
      .createQueryBuilder('v')
      .where('v.tenantId = :tenantId', { tenantId })
      .andWhere('v.latitude IS NOT NULL')
      .andWhere('v.longitude IS NOT NULL');

    if (groupBy === 'neighborhood') {
      qb.select('v.neighborhood', 'label')
        .addSelect('v.city', 'city')
        .addSelect('AVG(v.latitude)', 'latitude')
        .addSelect('AVG(v.longitude)', 'longitude')
        .addSelect('COUNT(*)', 'count')
        .andWhere('v.neighborhood IS NOT NULL')
        .groupBy('v.neighborhood')
        .addGroupBy('v.city');
    } else if (groupBy === 'city') {
      qb.select('v.city', 'label')
        .addSelect('v.state', 'state')
        .addSelect('AVG(v.latitude)', 'latitude')
        .addSelect('AVG(v.longitude)', 'longitude')
        .addSelect('COUNT(*)', 'count')
        .andWhere('v.city IS NOT NULL')
        .groupBy('v.city')
        .addGroupBy('v.state');
    } else {
      qb.select('v.state', 'label')
        .addSelect('AVG(v.latitude)', 'latitude')
        .addSelect('AVG(v.longitude)', 'longitude')
        .addSelect('COUNT(*)', 'count')
        .andWhere('v.state IS NOT NULL')
        .groupBy('v.state');
    }

    return qb.orderBy('count', 'DESC').getRawMany();
  }

  async getNeighborhoods(tenantId: string) {
    const rows = await this.votersRepo
      .createQueryBuilder('v')
      .select('DISTINCT v.neighborhood', 'neighborhood')
      .where('v.tenantId = :tenantId', { tenantId })
      .andWhere('v.neighborhood IS NOT NULL')
      .andWhere("v.neighborhood != ''")
      .orderBy('v.neighborhood', 'ASC')
      .getRawMany();
    return rows.map((r) => r.neighborhood);
  }

  async getStatsByNeighborhood(tenantId: string) {
    return this.votersRepo
      .createQueryBuilder('v')
      .select('v.neighborhood', 'neighborhood')
      .addSelect('COUNT(*)', 'count')
      .where('v.tenantId = :tenantId', { tenantId })
      .andWhere('v.neighborhood IS NOT NULL')
      .groupBy('v.neighborhood')
      .orderBy('count', 'DESC')
      .getRawMany();
  }

  async getStatsBySupportLevel(tenantId: string) {
    return this.votersRepo
      .createQueryBuilder('v')
      .select('v.supportLevel', 'supportLevel')
      .addSelect('COUNT(*)', 'count')
      .where('v.tenantId = :tenantId', { tenantId })
      .groupBy('v.supportLevel')
      .getRawMany();
  }

  async getStatsByConfidenceLevel(tenantId: string) {
    return this.votersRepo
      .createQueryBuilder('v')
      .select('v.confidenceLevel', 'confidenceLevel')
      .addSelect('COUNT(*)', 'count')
      .where('v.tenantId = :tenantId', { tenantId })
      .groupBy('v.confidenceLevel')
      .getRawMany();
  }

  async getStatsByCity(tenantId: string) {
    return this.votersRepo
      .createQueryBuilder('v')
      .select('v.city', 'city')
      .addSelect('v.state', 'state')
      .addSelect('COUNT(*)', 'count')
      .where('v.tenantId = :tenantId', { tenantId })
      .andWhere('v.city IS NOT NULL')
      .groupBy('v.city')
      .addGroupBy('v.state')
      .orderBy('count', 'DESC')
      .getRawMany();
  }

  async importFromExcel(tenantId: string, buffer: Buffer) {
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    // Try to find a data sheet (skip summary sheets)
    const dataSheetNames = ['Cadastro de Eleitores', 'Eleitores'];
    let sheet =
      workbook.Sheets[
        dataSheetNames.find((n) => workbook.SheetNames.includes(n)) ?? ''
      ];
    if (!sheet) sheet = workbook.Sheets[workbook.SheetNames[0]];
    if (!sheet) throw new BadRequestException('Planilha vazia');

    let rows = XLSX.utils.sheet_to_json<Record<string, any>>(sheet);
    if (rows.length === 0)
      throw new BadRequestException('Nenhum registro encontrado na planilha');

    // Detect report format: if any of the first rows have __EMPTY keys, it's a report
    const isReport = rows
      .slice(0, 5)
      .some((r) => Object.keys(r).some((k) => k.startsWith('__EMPTY')));
    if (isReport) {
      // Find the header row: the one with "Nome" or "Nome Completo" as a VALUE and multiple columns
      const headerIdx = rows.findIndex((r) => {
        const vals = Object.values(r).map((v) =>
          String(v).toLowerCase().trim(),
        );
        return (
          vals.some((v) => v === 'nome' || v === 'nome completo') &&
          Object.keys(r).length > 3
        );
      });
      if (headerIdx >= 0) {
        const headerValues = Object.values(rows[headerIdx]).map((v) =>
          String(v).trim(),
        );
        const dataRows = rows.slice(headerIdx + 1);
        rows = dataRows.map((r) => {
          const obj: Record<string, any> = {};
          const values = Object.values(r);
          headerValues.forEach((h, i) => {
            if (
              h &&
              values[i] !== undefined &&
              values[i] !== null &&
              String(values[i]).trim() !== ''
            ) {
              obj[h] = values[i];
            }
          });
          return obj;
        });
      }
    }

    const COLUMN_MAP: Record<string, string> = {
      nome: 'name',
      'nome completo': 'name',
      telefone: 'phone',
      whatsapp: 'phone',
      'data de nascimento': 'birthDate',
      endereco: 'address',
      endereço: 'address',
      bairro: 'neighborhood',
      cidade: 'city',
      estado: 'state',
      cep: 'zipCode',
      titulo: 'voterRegistration',
      'titulo de eleitor': 'voterRegistration',
      lideranca: 'leaderName',
      liderança: 'leaderName',
      'lideranca responsavel': 'leaderName',
      'liderança responsável': 'leaderName',
      articulador: 'leaderName',
      'nivel de confianca': 'confidenceLevel',
      'nivel de confiança': 'confidenceLevel',
      confianca: 'confidenceLevel',
      confiança: 'confidenceLevel',
    };

    // Pre-load leaders for name matching + auto-create
    const existingLeaders = await this.leadersRepo.find({
      where: { tenantId },
      select: ['id', 'name'],
    });
    const leaderByName = new Map<string, string>();
    for (const l of existingLeaders) {
      leaderByName.set(l.name.toLowerCase().trim(), l.id);
    }

    let imported = 0;
    let skipped = 0;
    const errors: string[] = [];
    const batch: Record<string, any>[] = [];
    const BATCH_SIZE = 500;

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const mapped: Record<string, any> = {};

      for (const [header, value] of Object.entries(row)) {
        const key = COLUMN_MAP[header.toLowerCase().trim()];
        if (
          key &&
          value !== null &&
          value !== undefined &&
          String(value).trim() !== ''
        ) {
          mapped[key] = String(value).trim();
        }
      }

      if (!mapped.name) {
        skipped++;
        if (errors.length < 20) errors.push(`Linha ${i + 2}: nome obrigatorio`);
        continue;
      }

      // Handle Excel date serial numbers for birthDate
      if (mapped.birthDate) {
        const num = Number(mapped.birthDate);
        if (!isNaN(num) && num > 10000) {
          const date = XLSX.SSF.parse_date_code(num);
          if (date) {
            mapped.birthDate = `${date.y}-${String(date.m).padStart(2, '0')}-${String(date.d).padStart(2, '0')}`;
          }
        } else {
          const parts = mapped.birthDate.match(
            /(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/,
          );
          if (parts) {
            mapped.birthDate = `${parts[3]}-${parts[2].padStart(2, '0')}-${parts[1].padStart(2, '0')}`;
          }
        }
      }

      // Resolve leader by name: match existing or create new
      if (mapped.leaderName) {
        const normalizedName = mapped.leaderName.toLowerCase().trim();
        let leaderId = leaderByName.get(normalizedName);
        if (!leaderId) {
          const newLeader = this.leadersRepo.create({
            tenantId,
            name: mapped.leaderName,
          });
          const saved = await this.leadersRepo.save(newLeader);
          leaderId = saved.id;
          leaderByName.set(normalizedName, leaderId);
        }
        mapped.leaderId = leaderId;
        delete mapped.leaderName;
      }

      mapped.tenantId = tenantId;
      batch.push(mapped);

      if (batch.length >= BATCH_SIZE) {
        try {
          await this.votersRepo
            .createQueryBuilder()
            .insert()
            .values(batch)
            .execute();
          imported += batch.length;
        } catch {
          // Fallback: try one by one to identify bad rows
          for (const item of batch) {
            try {
              await this.votersRepo.save(this.votersRepo.create(item as any));
              imported++;
            } catch {
              skipped++;
              if (errors.length < 20)
                errors.push(`Erro ao salvar "${item.name}"`);
            }
          }
        }
        batch.length = 0;
      }
    }

    // Flush remaining batch
    if (batch.length > 0) {
      try {
        await this.votersRepo
          .createQueryBuilder()
          .insert()
          .values(batch)
          .execute();
        imported += batch.length;
      } catch {
        for (const item of batch) {
          try {
            await this.votersRepo.save(this.votersRepo.create(item as any));
            imported++;
          } catch {
            skipped++;
            if (errors.length < 20)
              errors.push(`Erro ao salvar "${item.name}"`);
          }
        }
      }
    }

    // Geocodificar em background por combinacao unica de bairro+cidade+estado
    this.geocodeAllVoters(tenantId).catch((err) =>
      this.logger.error(`Erro no geocoding em background: ${err}`),
    );

    return {
      imported,
      skipped,
      total: rows.length,
      errors: errors.slice(0, 20),
    };
  }

  async getGeocodeStatus(tenantId: string) {
    const [totalResult, pendingResult, groupsResult] = await Promise.all([
      this.votersRepo
        .createQueryBuilder('v')
        .select('COUNT(*)', 'count')
        .where('v.tenantId = :tenantId', { tenantId })
        .getRawOne(),
      this.votersRepo
        .createQueryBuilder('v')
        .select('COUNT(*)', 'count')
        .where('v.tenantId = :tenantId', { tenantId })
        .andWhere('v.latitude IS NULL')
        .andWhere('(v.neighborhood IS NOT NULL OR v.city IS NOT NULL)')
        .getRawOne(),
      this.votersRepo
        .createQueryBuilder('v')
        .select('v.neighborhood', 'neighborhood')
        .addSelect('v.city', 'city')
        .addSelect('v.state', 'state')
        .where('v.tenantId = :tenantId', { tenantId })
        .andWhere('v.latitude IS NULL')
        .andWhere('(v.neighborhood IS NOT NULL OR v.city IS NOT NULL)')
        .groupBy('v.neighborhood')
        .addGroupBy('v.city')
        .addGroupBy('v.state')
        .getRawMany(),
    ]);

    const total = parseInt(totalResult?.count ?? '0', 10);
    const pending = parseInt(pendingResult?.count ?? '0', 10);
    const groups = groupsResult.length;
    // Estimativa: ~1.1s por grupo
    const estimatedSeconds = Math.ceil(groups * 1.1);

    return { total, pending, groups, estimatedSeconds };
  }

  /**
   * Geocodifica eleitores sem coordenadas, agrupando por bairro+cidade+estado
   * para minimizar chamadas ao Nominatim.
   */
  async geocodeAllVoters(tenantId: string) {
    // Buscar combinacoes unicas de bairro+cidade+estado sem coordenadas
    const groups = await this.votersRepo
      .createQueryBuilder('v')
      .select('v.neighborhood', 'neighborhood')
      .addSelect('v.city', 'city')
      .addSelect('v.state', 'state')
      .where('v.tenantId = :tenantId', { tenantId })
      .andWhere('v.latitude IS NULL')
      .andWhere('(v.neighborhood IS NOT NULL OR v.city IS NOT NULL)')
      .groupBy('v.neighborhood')
      .addGroupBy('v.city')
      .addGroupBy('v.state')
      .getRawMany();

    this.logger.log(
      `Geocoding em background: ${groups.length} combinacoes unicas para tenant ${tenantId}`,
    );

    let geocoded = 0;
    for (const group of groups) {
      const geo = await this.geocodingService.geocode({
        neighborhood: group.neighborhood,
        city: group.city,
        state: group.state,
      });

      if (geo) {
        // Atualizar todos os eleitores deste grupo de uma vez
        const qb = this.votersRepo
          .createQueryBuilder()
          .update()
          .set({ latitude: geo.latitude, longitude: geo.longitude })
          .where('tenantId = :tenantId', { tenantId })
          .andWhere('latitude IS NULL');

        if (group.neighborhood) {
          qb.andWhere('neighborhood = :neighborhood', {
            neighborhood: group.neighborhood,
          });
        } else {
          qb.andWhere('neighborhood IS NULL');
        }
        if (group.city) {
          qb.andWhere('city = :city', { city: group.city });
        } else {
          qb.andWhere('city IS NULL');
        }

        const result = await qb.execute();
        geocoded += result.affected || 0;
      }
    }

    this.logger.log(
      `Geocoding concluido: ${geocoded} eleitores atualizados com coordenadas`,
    );
  }

  async generateTemplate(): Promise<Buffer> {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Eleitores');

    const headers = [
      'Nome',
      'Telefone',
      'Data de Nascimento',
      'Endereco',
      'Bairro',
      'Cidade',
      'Estado',
      'CEP',
      'Titulo',
      'Lideranca',
    ];
    const widths = [30, 16, 18, 35, 20, 20, 8, 12, 16, 25];

    ws.columns = headers.map((header, i) => ({ header, width: widths[i] }));

    const headerRow = ws.getRow(1);
    headerRow.eachCell((cell) => {
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF4A4A4A' },
      };
      cell.alignment = { horizontal: 'center' };
    });

    const arrayBuffer = await wb.xlsx.writeBuffer();
    return Buffer.from(arrayBuffer);
  }

  async exportToExcel(
    tenantId: string,
    filters: {
      search?: string;
      neighborhood?: string;
      leaderId?: string;
      gender?: string;
      confidenceLevel?: string;
    },
  ): Promise<Buffer> {
    const qb = this.votersRepo
      .createQueryBuilder('v')
      .where('v.tenantId = :tenantId', { tenantId })
      .orderBy('v.createdAt', 'DESC');

    if (filters.search) {
      qb.andWhere('(v.name ILIKE :q OR v.phone ILIKE :q)', {
        q: `%${filters.search}%`,
      });
    }
    if (filters.neighborhood) {
      qb.andWhere('v.neighborhood = :neighborhood', {
        neighborhood: filters.neighborhood,
      });
    }
    if (filters.leaderId) {
      qb.andWhere('v.leaderId = :leaderId', { leaderId: filters.leaderId });
    }
    if (filters.gender) {
      qb.andWhere('v.gender = :gender', { gender: filters.gender });
    }
    if (filters.confidenceLevel) {
      qb.andWhere('v.confidenceLevel = :confidenceLevel', {
        confidenceLevel: filters.confidenceLevel,
      });
    }

    const voters = await qb.getMany();

    // Load leaders for name mapping
    const leaders = await this.votersRepo.manager.query(
      `SELECT id, name FROM leaders WHERE "tenantId" = $1`,
      [tenantId],
    );
    const leaderMap = new Map<string, string>();
    for (const l of leaders) leaderMap.set(l.id, l.name);

    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Eleitores');

    const headers = [
      'Lideranca',
      'Nome',
      'Telefone',
      'Email',
      'Genero',
      'Data de Nascimento',
      'Endereco',
      'Bairro',
      'Cidade',
      'Estado',
      'CEP',
      'Titulo de Eleitor',
      'Zona',
      'Secao',
      'Nivel de Confianca',
      'Tags',
      'Observacoes',
    ];
    const widths = [
      25, 30, 16, 25, 12, 18, 35, 20, 20, 8, 12, 16, 8, 8, 18, 20, 35,
    ];

    ws.columns = headers.map((header, i) => ({ header, width: widths[i] }));

    const headerRow = ws.getRow(1);
    headerRow.eachCell((cell) => {
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF4A4A4A' },
      };
      cell.alignment = { horizontal: 'center' };
    });

    for (const v of voters) {
      ws.addRow([
        v.leaderId ? (leaderMap.get(v.leaderId) ?? '') : '',
        v.name,
        v.phone ?? '',
        v.email ?? '',
        v.gender ?? '',
        v.birthDate ? String(v.birthDate) : '',
        v.address ?? '',
        v.neighborhood ?? '',
        v.city ?? '',
        v.state ?? '',
        v.zipCode ?? '',
        v.voterRegistration ?? '',
        v.votingZone ?? '',
        v.votingSection ?? '',
        v.confidenceLevel ?? '',
        (v.tags ?? []).join(', '),
        v.notes ?? '',
      ]);
    }

    const arrayBuffer = await wb.xlsx.writeBuffer();
    return Buffer.from(arrayBuffer);
  }

  async findAllPaginated(
    tenantId: string,
    filters: {
      page?: number;
      limit?: number;
      search?: string;
      neighborhood?: string;
      leaderId?: string;
      gender?: string;
      confidenceLevel?: string;
    },
  ): Promise<{ data: Voter[]; total: number; page: number; limit: number }> {
    const page = Math.max(1, filters.page || 1);
    const limit = Math.min(200, Math.max(1, filters.limit || 50));
    const offset = (page - 1) * limit;

    const qb = this.votersRepo
      .createQueryBuilder('v')
      .where('v.tenantId = :tenantId', { tenantId });

    if (filters.search) {
      qb.andWhere('(v.name ILIKE :q OR v.phone ILIKE :q)', {
        q: `%${filters.search}%`,
      });
    }
    if (filters.neighborhood) {
      qb.andWhere('v.neighborhood = :neighborhood', {
        neighborhood: filters.neighborhood,
      });
    }
    if (filters.leaderId) {
      qb.andWhere('v.leaderId = :leaderId', { leaderId: filters.leaderId });
    }
    if (filters.gender) {
      qb.andWhere('v.gender = :gender', { gender: filters.gender });
    }
    if (filters.confidenceLevel) {
      qb.andWhere('v.confidenceLevel = :confidenceLevel', {
        confidenceLevel: filters.confidenceLevel,
      });
    }

    qb.orderBy('v.createdAt', 'DESC');

    const [data, total] = await qb.skip(offset).take(limit).getManyAndCount();

    return { data, total, page, limit };
  }

  async getListStats(
    tenantId: string,
    filters: {
      search?: string;
      neighborhood?: string;
      leaderId?: string;
      gender?: string;
      confidenceLevel?: string;
    },
  ): Promise<{
    total: number;
    withPhone: number;
    withNeighborhood: number;
    bairros: string[];
    genders: string[];
    top5Bairros: { name: string; count: number }[];
  }> {
    const baseQb = () => {
      const qb = this.votersRepo
        .createQueryBuilder('v')
        .where('v.tenantId = :tenantId', { tenantId });

      if (filters.search) {
        qb.andWhere('(v.name ILIKE :q OR v.phone ILIKE :q)', {
          q: `%${filters.search}%`,
        });
      }
      if (filters.neighborhood) {
        qb.andWhere('v.neighborhood = :neighborhood', {
          neighborhood: filters.neighborhood,
        });
      }
      if (filters.leaderId) {
        qb.andWhere('v.leaderId = :leaderId', { leaderId: filters.leaderId });
      }
      if (filters.gender) {
        qb.andWhere('v.gender = :gender', { gender: filters.gender });
      }
      if (filters.confidenceLevel) {
        qb.andWhere('v.confidenceLevel = :confidenceLevel', {
          confidenceLevel: filters.confidenceLevel,
        });
      }
      return qb;
    };

    const [
      totalResult,
      withPhoneResult,
      withNeighborhoodResult,
      bairrosResult,
      gendersResult,
      top5BairrosResult,
    ] = await Promise.all([
      baseQb().select('COUNT(*)', 'count').getRawOne(),
      baseQb()
        .andWhere("v.phone IS NOT NULL AND v.phone != ''")
        .select('COUNT(*)', 'count')
        .getRawOne(),
      baseQb()
        .andWhere("v.neighborhood IS NOT NULL AND v.neighborhood != ''")
        .select('COUNT(*)', 'count')
        .getRawOne(),
      baseQb()
        .select('DISTINCT v.neighborhood', 'neighborhood')
        .andWhere("v.neighborhood IS NOT NULL AND v.neighborhood != ''")
        .orderBy('v.neighborhood', 'ASC')
        .getRawMany(),
      baseQb()
        .select('DISTINCT v.gender', 'gender')
        .andWhere("v.gender IS NOT NULL AND v.gender != ''")
        .orderBy('v.gender', 'ASC')
        .getRawMany(),
      baseQb()
        .select('v.neighborhood', 'name')
        .addSelect('COUNT(*)', 'count')
        .andWhere("v.neighborhood IS NOT NULL AND v.neighborhood != ''")
        .groupBy('v.neighborhood')
        .orderBy('count', 'DESC')
        .limit(5)
        .getRawMany(),
    ]);

    return {
      total: parseInt(totalResult?.count ?? '0', 10),
      withPhone: parseInt(withPhoneResult?.count ?? '0', 10),
      withNeighborhood: parseInt(withNeighborhoodResult?.count ?? '0', 10),
      bairros: bairrosResult.map((r: any) => r.neighborhood),
      genders: gendersResult.map((r: any) => r.gender),
      top5Bairros: top5BairrosResult.map((r: any) => ({
        name: r.name,
        count: parseInt(r.count, 10),
      })),
    };
  }

  async getLeaderRankingByConfidence(tenantId: string) {
    const rows = await this.votersRepo.query(
      `SELECT
         l.id AS "leaderId",
         l.name AS "leaderName",
         COUNT(*)::int AS "totalVoters",
         COUNT(*) FILTER (WHERE v."confidenceLevel" = 'ALTO')::int AS "altoCount",
         COUNT(*) FILTER (WHERE v."confidenceLevel" = 'NEUTRO')::int AS "neutroCount",
         COUNT(*) FILTER (WHERE v."confidenceLevel" = 'BAIXO')::int AS "baixoCount",
         SUM(
           CASE v."confidenceLevel"
             WHEN 'ALTO' THEN 3
             WHEN 'NEUTRO' THEN 1
             WHEN 'BAIXO' THEN 0.5
             ELSE 0
           END
         )::float AS "score"
       FROM voters v
       INNER JOIN leaders l ON l.id = v."leaderId"::uuid
       WHERE v."tenantId" = $1
         AND v."leaderId" IS NOT NULL
       GROUP BY l.id, l.name
       ORDER BY "score" DESC
       LIMIT 5`,
      [tenantId],
    );
    return rows;
  }

  async search(tenantId: string, query: string) {
    return this.votersRepo
      .createQueryBuilder('v')
      .where('v.tenantId = :tenantId', { tenantId })
      .andWhere(
        '(v.name ILIKE :query OR v.cpf ILIKE :query OR v.phone ILIKE :query)',
        {
          query: `%${query}%`,
        },
      )
      .orderBy('v.name', 'ASC')
      .limit(50)
      .getMany();
  }
}
