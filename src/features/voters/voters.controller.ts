import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  Req,
  Res,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  ParseUUIDPipe,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { VotersService } from './voters.service';
import { CreateVoterDto } from './dto/create-voter.dto';
import { UpdateVoterDto } from './dto/update-voter.dto';
import { JwtAuthGuard } from '../../core/auth/guards/jwt-auth.guard';
import { ModuleAccessGuard } from '../../shared/guards/module-access.guard';
import { RequiresModule } from '../../shared/decorators/requires-module.decorator';

@Controller('voters')
@UseGuards(JwtAuthGuard, ModuleAccessGuard)
@RequiresModule('voters')
export class VotersController {
  constructor(private votersService: VotersService) {}

  @Get()
  findAll(
    @Req() req: any,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
    @Query('neighborhood') neighborhood?: string | string[],
    @Query('leaderId') leaderId?: string | string[],
    @Query('gender') gender?: string,
    @Query('confidenceLevel') confidenceLevel?: string,
  ) {
    const neighborhoods = neighborhood
      ? Array.isArray(neighborhood) ? neighborhood : [neighborhood]
      : undefined;
    const leaderIds = leaderId
      ? Array.isArray(leaderId) ? leaderId : [leaderId]
      : undefined;
    return this.votersService.findAllPaginated(req.tenantId, {
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
      search,
      neighborhoods,
      leaderIds,
      gender,
      confidenceLevel,
    });
  }

  @Get('list-stats')
  getListStats(
    @Req() req: any,
    @Query('search') search?: string,
    @Query('neighborhood') neighborhood?: string | string[],
    @Query('leaderId') leaderId?: string | string[],
    @Query('gender') gender?: string,
    @Query('confidenceLevel') confidenceLevel?: string,
  ) {
    const neighborhoods = neighborhood
      ? Array.isArray(neighborhood) ? neighborhood : [neighborhood]
      : undefined;
    const leaderIds = leaderId
      ? Array.isArray(leaderId) ? leaderId : [leaderId]
      : undefined;
    return this.votersService.getListStats(req.tenantId, {
      search,
      neighborhoods,
      leaderIds,
      gender,
      confidenceLevel,
    });
  }

  @Get('search')
  search(@Req() req: any, @Query('q') query: string) {
    return this.votersService.search(req.tenantId, query);
  }

  @Get('heatmap')
  getHeatmap(@Req() req: any) {
    return this.votersService.getHeatmapData(req.tenantId);
  }

  @Get('heatmap/aggregated')
  getHeatmapAggregated(
    @Req() req: any,
    @Query('groupBy') groupBy: 'neighborhood' | 'city' | 'state',
  ) {
    const valid = ['neighborhood', 'city', 'state'];
    const group = valid.includes(groupBy) ? groupBy : 'neighborhood';
    return this.votersService.getHeatmapAggregated(req.tenantId, group);
  }

  @Get('neighborhoods')
  getNeighborhoods(@Req() req: any) {
    return this.votersService.getNeighborhoods(req.tenantId);
  }

  @Get('stats/neighborhood')
  statsByNeighborhood(@Req() req: any) {
    return this.votersService.getStatsByNeighborhood(req.tenantId);
  }

  @Get('stats/city')
  statsByCity(@Req() req: any) {
    return this.votersService.getStatsByCity(req.tenantId);
  }

  @Get('stats/support-level')
  statsBySupportLevel(@Req() req: any) {
    return this.votersService.getStatsBySupportLevel(req.tenantId);
  }

  @Get('stats/confidence-level')
  statsByConfidenceLevel(@Req() req: any) {
    return this.votersService.getStatsByConfidenceLevel(req.tenantId);
  }

  @Get('stats/leader-ranking')
  leaderRanking(@Req() req: any) {
    return this.votersService.getLeaderRankingByConfidence(req.tenantId);
  }

  @Get('export')
  async exportExcel(
    @Req() req: any,
    @Res() res: Response,
    @Query('search') search?: string,
    @Query('neighborhood') neighborhood?: string | string[],
    @Query('leaderId') leaderId?: string | string[],
    @Query('gender') gender?: string,
    @Query('confidenceLevel') confidenceLevel?: string,
    @Query('fields') fields?: string,
  ) {
    const neighborhoods = neighborhood
      ? Array.isArray(neighborhood) ? neighborhood : [neighborhood]
      : undefined;
    const leaderIds = leaderId
      ? Array.isArray(leaderId) ? leaderId : [leaderId]
      : undefined;
    const buffer = await this.votersService.exportToExcel(req.tenantId, {
      search,
      neighborhoods,
      leaderIds,
      gender,
      confidenceLevel,
      fields: fields ? fields.split(',') : undefined,
    });
    res.set({
      'Content-Type':
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="eleitores.xlsx"',
    });
    res.send(buffer);
  }

  @Get('import/template')
  async downloadTemplate(@Res() res: Response) {
    const buffer = await this.votersService.generateTemplate();
    res.set({
      'Content-Type':
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="modelo_eleitores.xlsx"',
    });
    res.send(buffer);
  }

  @Post('import/upload')
  @UseInterceptors(FileInterceptor('file'))
  importUpload(@Req() req: any, @UploadedFile() file: Express.Multer.File) {
    if (!file || !file.buffer) {
      throw new BadRequestException(
        'Arquivo nao recebido. Envie um .xlsx valido.',
      );
    }
    return this.votersService.importFromExcel(req.tenantId, file.buffer);
  }

  @Get('geocode-status')
  getGeocodeStatus(@Req() req: any) {
    return this.votersService.getGeocodeStatus(req.tenantId);
  }

  @Post('geocode-all')
  geocodeAll(@Req() req: any) {
    // Dispara em background e retorna imediatamente
    this.votersService.geocodeAllVoters(req.tenantId).catch(() => {});
    return { started: true, message: 'Geocoding iniciado em background' };
  }

  @Get(':id')
  findOne(@Req() req: any, @Param('id', ParseUUIDPipe) id: string) {
    return this.votersService.findOne(req.tenantId, id);
  }

  @Post()
  create(@Req() req: any, @Body() dto: CreateVoterDto) {
    return this.votersService.create(req.tenantId, dto);
  }

  @Patch(':id')
  update(
    @Req() req: any,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateVoterDto,
  ) {
    return this.votersService.update(req.tenantId, id, dto);
  }

  @Delete(':id')
  remove(@Req() req: any, @Param('id', ParseUUIDPipe) id: string) {
    return this.votersService.remove(req.tenantId, id);
  }
}
