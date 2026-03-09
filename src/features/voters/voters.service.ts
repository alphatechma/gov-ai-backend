import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DeepPartial } from 'typeorm';
import { Voter } from './voter.entity';
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
    return super.create(tenantId, dto);
  }

  async update(tenantId: string, id: string, dto: DeepPartial<Voter>) {
    // Re-geocodificar se campos de endereço mudaram e não vieram coordenadas novas
    const addressFieldChanged = dto.address !== undefined || dto.neighborhood !== undefined
      || dto.city !== undefined || dto.state !== undefined || dto.zipCode !== undefined;

    if (addressFieldChanged && dto.latitude === undefined) {
      const existing = await this.findOne(tenantId, id);
      const address = dto.address !== undefined ? dto.address as string : existing.address;
      const neighborhood = dto.neighborhood !== undefined ? dto.neighborhood as string : existing.neighborhood;
      const city = dto.city !== undefined ? dto.city as string : existing.city;
      const state = dto.state !== undefined ? dto.state as string : existing.state;
      const zipCode = dto.zipCode !== undefined ? dto.zipCode as string : existing.zipCode;

      if (address || neighborhood || city) {
        const geo = await this.geocodingService.geocode({ address, neighborhood, city, state, zipCode });
        if (geo) {
          dto.latitude = geo.latitude;
          dto.longitude = geo.longitude;
        }
      }
    }
    return super.update(tenantId, id, dto);
  }

  async getHeatmapData(tenantId: string) {
    return this.votersRepo
      .createQueryBuilder('v')
      .select(['v.latitude', 'v.longitude', 'v.name', 'v.neighborhood', 'v.city', 'v.state', 'v.supportLevel'])
      .where('v.tenantId = :tenantId', { tenantId })
      .andWhere('v.latitude IS NOT NULL')
      .andWhere('v.longitude IS NOT NULL')
      .getMany();
  }

  async getHeatmapAggregated(tenantId: string, groupBy: 'neighborhood' | 'city' | 'state') {
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
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    if (!sheet) throw new BadRequestException('Planilha vazia');

    const rows = XLSX.utils.sheet_to_json<Record<string, any>>(sheet);
    if (rows.length === 0) throw new BadRequestException('Nenhum registro encontrado na planilha');

    const COLUMN_MAP: Record<string, string> = {
      nome: 'name',
      telefone: 'phone',
      'data de nascimento': 'birthDate',
      'endereco': 'address',
      'endereço': 'address',
      bairro: 'neighborhood',
      cidade: 'city',
      estado: 'state',
      cep: 'zipCode',
      titulo: 'voterRegistration',
      'titulo de eleitor': 'voterRegistration',
    };

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

      if (!mapped.name) {
        skipped++;
        errors.push(`Linha ${i + 2}: nome obrigatorio`);
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
          // Try to parse DD/MM/YYYY
          const parts = mapped.birthDate.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
          if (parts) {
            mapped.birthDate = `${parts[3]}-${parts[2].padStart(2, '0')}-${parts[1].padStart(2, '0')}`;
          }
        }
      }

      try {
        await this.create(tenantId, mapped as any);
        imported++;
      } catch {
        skipped++;
        errors.push(`Linha ${i + 2}: erro ao salvar "${mapped.name}"`);
      }
    }

    return { imported, skipped, total: rows.length, errors: errors.slice(0, 20) };
  }

  async generateTemplate(): Promise<Buffer> {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Eleitores');

    const headers = ['Nome', 'Telefone', 'Data de Nascimento', 'Endereco', 'Bairro', 'Cidade', 'Estado', 'CEP', 'Titulo'];
    const widths = [30, 16, 18, 35, 20, 20, 8, 12, 16];

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

  async search(tenantId: string, query: string) {
    return this.votersRepo
      .createQueryBuilder('v')
      .where('v.tenantId = :tenantId', { tenantId })
      .andWhere('(v.name ILIKE :query OR v.cpf ILIKE :query OR v.phone ILIKE :query)', {
        query: `%${query}%`,
      })
      .orderBy('v.name', 'ASC')
      .limit(50)
      .getMany();
  }
}
