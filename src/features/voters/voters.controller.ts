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
  findAll(@Req() req: any) {
    return this.votersService.findAll(req.tenantId);
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

  @Get('export')
  async exportExcel(
    @Req() req: any,
    @Res() res: Response,
    @Query('search') search?: string,
    @Query('neighborhood') neighborhood?: string,
    @Query('leaderId') leaderId?: string,
    @Query('gender') gender?: string,
  ) {
    const buffer = await this.votersService.exportToExcel(req.tenantId, {
      search, neighborhood, leaderId, gender,
    });
    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="eleitores.xlsx"',
    });
    res.send(buffer);
  }

  @Get('import/template')
  async downloadTemplate(@Res() res: Response) {
    const buffer = await this.votersService.generateTemplate();
    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="modelo_eleitores.xlsx"',
    });
    res.send(buffer);
  }

  @Post('import/upload')
  @UseInterceptors(FileInterceptor('file'))
  importUpload(@Req() req: any, @UploadedFile() file: Express.Multer.File) {
    return this.votersService.importFromExcel(req.tenantId, file.buffer);
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
  update(@Req() req: any, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateVoterDto) {
    return this.votersService.update(req.tenantId, id, dto);
  }

  @Delete(':id')
  remove(@Req() req: any, @Param('id', ParseUUIDPipe) id: string) {
    return this.votersService.remove(req.tenantId, id);
  }
}
