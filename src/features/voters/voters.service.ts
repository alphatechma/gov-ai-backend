import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DeepPartial } from 'typeorm';
import { Voter } from './voter.entity';
import { Leader } from '../leaders/leader.entity';
import { TenantAwareService } from '../../shared/base/tenant-aware.service';
import { GeocodingService } from '../../shared/services/geocoding.service';
import { HelpRecordsService } from '../help-records/help-records.service';
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
    private helpRecordsService: HelpRecordsService,
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

  /**
   * Normaliza nome para comparação: uppercase, sem acentos, sem espaços extras.
   */
  private normalizeName(name: string): string {
    return name
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, '')
      .toUpperCase();
  }

  /**
   * Normaliza telefone para comparação: só dígitos.
   */
  private normalizePhone(phone: string): string {
    return phone.replace(/[\s\-\(\)\.]/g, '');
  }

  /**
   * Gera chave de deduplicação a partir de nome + telefone normalizados.
   */
  private buildDuplicateKey(name: string, phone: string): string {
    return `${this.normalizeName(name)}|${this.normalizePhone(phone)}`;
  }

  /**
   * Carrega índice de eleitores existentes (nome + telefone) do tenant.
   */
  private async buildDuplicateIndex(tenantId: string): Promise<Set<string>> {
    const existing: { name: string; phone: string }[] = await this.votersRepo
      .createQueryBuilder('v')
      .select(['v.name', 'v.phone'])
      .where('v.tenantId = :tenantId', { tenantId })
      .andWhere('v.phone IS NOT NULL')
      .andWhere("v.phone != ''")
      .getMany();

    const index = new Set<string>();
    for (const v of existing) {
      index.add(this.buildDuplicateKey(v.name, v.phone));
    }
    return index;
  }

  /**
   * Parseia o workbook e retorna as linhas normalizadas.
   */
  private parseWorkbook(buffer: Buffer): Record<string, any>[] {
    const workbook = XLSX.read(buffer, { type: 'buffer' });
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

    const isReport = rows
      .slice(0, 5)
      .some((r) => Object.keys(r).some((k) => k.startsWith('__EMPTY')));
    if (isReport) {
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

    return rows;
  }

  /**
   * Mapeia uma linha do Excel para os campos da entidade.
   */
  private mapRow(
    row: Record<string, any>,
    columnMap: Record<string, string>,
  ): Record<string, any> {
    const mapped: Record<string, any> = {};
    for (const [header, value] of Object.entries(row)) {
      const key = columnMap[header.toLowerCase().trim()];
      if (
        key &&
        value !== null &&
        value !== undefined &&
        String(value).trim() !== ''
      ) {
        mapped[key] = String(value).trim();
      }
    }
    return mapped;
  }

  /**
   * Parseia birthDate de serial Excel ou DD/MM/YYYY.
   */
  private parseBirthDate(raw: string): string {
    const num = Number(raw);
    if (!isNaN(num) && num > 10000) {
      const date = XLSX.SSF.parse_date_code(num);
      if (date) {
        return `${date.y}-${String(date.m).padStart(2, '0')}-${String(date.d).padStart(2, '0')}`;
      }
    }
    const parts = raw.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
    if (parts) {
      return `${parts[3]}-${parts[2].padStart(2, '0')}-${parts[1].padStart(2, '0')}`;
    }
    return raw;
  }

  /**
   * Insere batch no banco com fallback individual.
   */
  private async flushBatch(
    batch: Record<string, any>[],
    errors: string[],
  ): Promise<{ imported: number; failed: number }> {
    let imported = 0;
    let failed = 0;
    try {
      await this.votersRepo
        .createQueryBuilder()
        .insert()
        .values(batch)
        .execute();
      imported = batch.length;
    } catch {
      for (const item of batch) {
        try {
          await this.votersRepo.save(this.votersRepo.create(item as any));
          imported++;
        } catch {
          failed++;
          if (errors.length < 20)
            errors.push(`Erro ao salvar "${item.name}"`);
        }
      }
    }
    return { imported, failed };
  }

  async importFromExcel(tenantId: string, buffer: Buffer) {
    const rows = this.parseWorkbook(buffer);

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
      // Atendimento (opcional)
      'tipo de atendimento': 'helpType',
      'tipo de suporte': 'helpType',
      categoria: 'helpCategory',
      'data do atendimento': 'helpDate',
      observacoes: 'helpObservations',
      observações: 'helpObservations',
      'status do atendimento': 'helpStatus',
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

    // Build duplicate index (nome + telefone normalizados)
    const duplicateIndex = await this.buildDuplicateIndex(tenantId);

    let imported = 0;
    let skipped = 0;
    let duplicates = 0;
    let helpRecordsCreated = 0;
    let helpRecordsSkipped = 0;
    const errors: string[] = [];
    const batch: Record<string, any>[] = [];
    const BATCH_SIZE = 500;

    for (let i = 0; i < rows.length; i++) {
      const mapped = this.mapRow(rows[i], COLUMN_MAP);

      if (!mapped.name) {
        skipped++;
        if (errors.length < 20) errors.push(`Linha ${i + 2}: nome obrigatorio`);
        continue;
      }

      // Verificar duplicidade por nome + telefone
      if (mapped.phone) {
        const dupKey = this.buildDuplicateKey(mapped.name, mapped.phone);
        if (duplicateIndex.has(dupKey)) {
          duplicates++;
          if (errors.length < 20)
            errors.push(
              `Linha ${i + 2}: eleitor "${mapped.name}" já cadastrado (nome + telefone)`,
            );
          continue;
        }
        // Adicionar ao índice para detectar duplicatas dentro do próprio arquivo
        duplicateIndex.add(dupKey);
      }

      if (mapped.birthDate) {
        mapped.birthDate = this.parseBirthDate(mapped.birthDate);
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

      // Extrair campos de atendimento (opcional). Gatilho: helpType preenchido.
      const helpType = mapped.helpType;
      const helpPayload = helpType
        ? {
            type: helpType as string,
            category: mapped.helpCategory as string | undefined,
            date: mapped.helpDate
              ? this.parseBirthDate(mapped.helpDate as string)
              : undefined,
            observations: mapped.helpObservations as string | undefined,
            status: mapped.helpStatus as string | undefined,
            leaderId: mapped.leaderId as string | undefined,
          }
        : null;
      delete mapped.helpType;
      delete mapped.helpCategory;
      delete mapped.helpDate;
      delete mapped.helpObservations;
      delete mapped.helpStatus;

      mapped.tenantId = tenantId;

      if (helpPayload) {
        // Flush o batch pendente antes de salvar individualmente, mantendo
        // a ordem de importacao e garantindo que o eleitor corrente obtenha ID.
        if (batch.length > 0) {
          const result = await this.flushBatch(batch, errors);
          imported += result.imported;
          skipped += result.failed;
          batch.length = 0;
        }

        let savedVoter: Voter | null = null;
        try {
          const entity = this.votersRepo.create(
            mapped as DeepPartial<Voter>,
          );
          savedVoter = await this.votersRepo.save(entity);
          imported++;
        } catch {
          skipped++;
          if (errors.length < 20)
            errors.push(`Linha ${i + 2}: erro ao salvar "${mapped.name}"`);
        }

        if (savedVoter) {
          try {
            await this.helpRecordsService.createInlineRecord(tenantId, {
              voterId: savedVoter.id,
              ...helpPayload,
            });
            helpRecordsCreated++;
          } catch {
            helpRecordsSkipped++;
            if (errors.length < 20) {
              errors.push(
                `Linha ${i + 2}: atendimento nao criado para "${mapped.name}"`,
              );
            }
          }
        }
      } else {
        batch.push(mapped);

        if (batch.length >= BATCH_SIZE) {
          const result = await this.flushBatch(batch, errors);
          imported += result.imported;
          skipped += result.failed;
          batch.length = 0;
        }
      }
    }

    // Flush remaining batch
    if (batch.length > 0) {
      const result = await this.flushBatch(batch, errors);
      imported += result.imported;
      skipped += result.failed;
    }

    // Sincronizar votersCount de todas as lideranças do tenant
    await this.leadersRepo.query(
      `UPDATE leaders l SET "votersCount" = (
        SELECT COUNT(*) FROM voters v WHERE v."leaderId" = l.id::text AND v."tenantId" = $1
      ) WHERE l."tenantId" = $1`,
      [tenantId],
    );

    // Geocodificar em background por combinacao unica de bairro+cidade+estado
    this.geocodeAllVoters(tenantId).catch((err) =>
      this.logger.error(`Erro no geocoding em background: ${err}`),
    );

    return {
      imported,
      skipped,
      duplicates,
      helpRecordsCreated,
      helpRecordsSkipped,
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
      // Colunas opcionais de atendimento
      'Tipo de Atendimento',
      'Categoria',
      'Data do Atendimento',
      'Observacoes',
      'Status do Atendimento',
    ];
    const widths = [30, 16, 18, 35, 20, 20, 8, 12, 16, 25, 25, 20, 18, 40, 20];
    // Indice das 5 colunas opcionais de atendimento (base 1 do ExcelJS)
    const optionalCols = new Set([11, 12, 13, 14, 15]);

    ws.columns = headers.map((header, i) => ({ header, width: widths[i] }));

    const headerRow = ws.getRow(1);
    headerRow.eachCell((cell, colNumber) => {
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: {
          argb: optionalCols.has(colNumber) ? 'FF2C5F7E' : 'FF4A4A4A',
        },
      };
      cell.alignment = { horizontal: 'center' };
    });

    // Linha de instrucao (row 2), apenas na primeira celula, explicando as opcionais
    const noteRow = ws.getRow(2);
    noteRow.getCell(1).value =
      'Colunas azuis: opcionais (preencha apenas se quiser criar um atendimento junto com o eleitor)';
    noteRow.getCell(1).font = { italic: true, color: { argb: 'FF666666' } };
    ws.mergeCells(2, 1, 2, headers.length);

    const arrayBuffer = await wb.xlsx.writeBuffer();
    return Buffer.from(arrayBuffer);
  }

  async exportToExcel(
    tenantId: string,
    filters: {
      search?: string;
      neighborhoods?: string[];
      leaderIds?: string[];
      gender?: string;
      confidenceLevel?: string;
      fields?: string[];
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
    if (filters.neighborhoods?.length) {
      qb.andWhere('v.neighborhood IN (:...neighborhoods)', { neighborhoods: filters.neighborhoods });
    }
    if (filters.leaderIds?.length) {
      qb.andWhere('v.leaderId IN (:...leaderIds)', { leaderIds: filters.leaderIds });
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

    // All available columns with key, header label, width, and value extractor
    const allColumns: {
      key: string;
      header: string;
      width: number;
      value: (v: any) => string;
    }[] = [
      { key: 'lideranca', header: 'Lideranca', width: 25, value: (v) => (v.leaderId ? (leaderMap.get(v.leaderId) ?? '') : '') },
      { key: 'nome', header: 'Nome', width: 30, value: (v) => v.name },
      { key: 'telefone', header: 'Telefone', width: 16, value: (v) => v.phone ?? '' },
      { key: 'email', header: 'Email', width: 25, value: (v) => v.email ?? '' },
      { key: 'genero', header: 'Genero', width: 12, value: (v) => v.gender ?? '' },
      { key: 'dataNascimento', header: 'Data de Nascimento', width: 18, value: (v) => (v.birthDate ? String(v.birthDate) : '') },
      { key: 'endereco', header: 'Endereco', width: 35, value: (v) => v.address ?? '' },
      { key: 'bairro', header: 'Bairro', width: 20, value: (v) => v.neighborhood ?? '' },
      { key: 'cidade', header: 'Cidade', width: 20, value: (v) => v.city ?? '' },
      { key: 'estado', header: 'Estado', width: 8, value: (v) => v.state ?? '' },
      { key: 'cep', header: 'CEP', width: 12, value: (v) => v.zipCode ?? '' },
      { key: 'tituloEleitor', header: 'Titulo de Eleitor', width: 16, value: (v) => v.voterRegistration ?? '' },
      { key: 'zona', header: 'Zona', width: 8, value: (v) => v.votingZone ?? '' },
      { key: 'secao', header: 'Secao', width: 8, value: (v) => v.votingSection ?? '' },
      { key: 'nivelConfianca', header: 'Nivel de Confianca', width: 18, value: (v) => v.confidenceLevel ?? '' },
      { key: 'tags', header: 'Tags', width: 20, value: (v) => (v.tags ?? []).join(', ') },
      { key: 'observacoes', header: 'Observacoes', width: 35, value: (v) => v.notes ?? '' },
    ];

    const selectedFields = filters.fields;
    const columns = selectedFields
      ? allColumns.filter((c) => selectedFields.includes(c.key))
      : allColumns;

    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Eleitores');

    ws.columns = columns.map((col) => ({ header: col.header, width: col.width }));

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
      ws.addRow(columns.map((col) => col.value(v)));
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
      neighborhoods?: string[];
      leaderIds?: string[];
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
    if (filters.neighborhoods?.length) {
      qb.andWhere('v.neighborhood IN (:...neighborhoods)', { neighborhoods: filters.neighborhoods });
    }
    if (filters.leaderIds?.length) {
      qb.andWhere('v.leaderId IN (:...leaderIds)', { leaderIds: filters.leaderIds });
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
      neighborhoods?: string[];
      leaderIds?: string[];
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
      if (filters.neighborhoods?.length) {
        qb.andWhere('v.neighborhood IN (:...neighborhoods)', { neighborhoods: filters.neighborhoods });
      }
      if (filters.leaderIds?.length) {
        qb.andWhere('v.leaderId IN (:...leaderIds)', { leaderIds: filters.leaderIds });
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
