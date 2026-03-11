import { Controller, Get, Post, Patch, Delete, Body, Param, Query, Req, Res, UseGuards, UseInterceptors, UploadedFile, ParseUUIDPipe } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { HelpRecordsService } from './help-records.service';
import { CreateHelpRecordDto } from './dto/create-help-record.dto';
import { UpdateHelpRecordDto } from './dto/update-help-record.dto';
import { JwtAuthGuard } from '../../core/auth/guards/jwt-auth.guard';
import { ModuleAccessGuard } from '../../shared/guards/module-access.guard';
import { RequiresModule } from '../../shared/decorators/requires-module.decorator';

@Controller('help-records')
@UseGuards(JwtAuthGuard, ModuleAccessGuard)
@RequiresModule('help-records')
export class HelpRecordsController {
  constructor(private service: HelpRecordsService) {}

  @Get('types')
  findAllTypes(@Req() req: any) { return this.service.findAllTypes(req.tenantId); }

  @Post('types')
  createType(@Req() req: any, @Body('name') name: string) { return this.service.createType(req.tenantId, name); }

  @Delete('types/:typeId')
  removeType(@Req() req: any, @Param('typeId', ParseUUIDPipe) typeId: string) { return this.service.removeType(req.tenantId, typeId); }

  @Get('export')
  async exportExcel(
    @Req() req: any,
    @Res() res: Response,
    @Query('search') search?: string,
    @Query('type') type?: string,
    @Query('status') status?: string,
    @Query('neighborhood') neighborhood?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
  ) {
    const buffer = await this.service.exportToExcel(req.tenantId, {
      search, type, status, neighborhood, dateFrom, dateTo,
    });
    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="atendimentos.xlsx"',
    });
    res.send(buffer);
  }

  @Get('import/template')
  async downloadTemplate(@Res() res: Response) {
    const buffer = await this.service.generateTemplate();
    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="modelo_atendimentos.xlsx"',
    });
    res.send(buffer);
  }

  @Post('import/upload')
  @UseInterceptors(FileInterceptor('file'))
  importUpload(@Req() req: any, @UploadedFile() file: Express.Multer.File) {
    return this.service.importFromExcel(req.tenantId, file.buffer);
  }

  @Get()
  findAll(
    @Req() req: any,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
    @Query('type') type?: string,
    @Query('status') status?: string,
    @Query('neighborhood') neighborhood?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
  ) {
    return this.service.findAllPaginated(req.tenantId, {
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
      search,
      type,
      status,
      neighborhood,
      dateFrom,
      dateTo,
    });
  }

  @Get('list-stats')
  getListStats(
    @Req() req: any,
    @Query('search') search?: string,
    @Query('type') type?: string,
    @Query('status') status?: string,
    @Query('neighborhood') neighborhood?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
  ) {
    return this.service.getListStats(req.tenantId, {
      search,
      type,
      status,
      neighborhood,
      dateFrom,
      dateTo,
    });
  }

  @Get(':id')
  findOne(@Req() req: any, @Param('id', ParseUUIDPipe) id: string) { return this.service.findOne(req.tenantId, id); }

  @Post()
  create(@Req() req: any, @Body() dto: CreateHelpRecordDto) { return this.service.create(req.tenantId, dto); }

  @Patch(':id')
  update(@Req() req: any, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateHelpRecordDto) { return this.service.update(req.tenantId, id, dto); }

  @Delete(':id')
  remove(@Req() req: any, @Param('id', ParseUUIDPipe) id: string) { return this.service.remove(req.tenantId, id); }
}
