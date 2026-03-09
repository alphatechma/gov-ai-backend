import { Controller, Get, Post, Patch, Delete, Body, Param, Req, UseGuards, ParseUUIDPipe } from '@nestjs/common';
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

  @Get()
  findAll(@Req() req: any) { return this.service.findAll(req.tenantId); }

  @Get(':id')
  findOne(@Req() req: any, @Param('id', ParseUUIDPipe) id: string) { return this.service.findOne(req.tenantId, id); }

  @Post()
  create(@Req() req: any, @Body() dto: CreateHelpRecordDto) { return this.service.create(req.tenantId, dto); }

  @Patch(':id')
  update(@Req() req: any, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateHelpRecordDto) { return this.service.update(req.tenantId, id, dto); }

  @Delete(':id')
  remove(@Req() req: any, @Param('id', ParseUUIDPipe) id: string) { return this.service.remove(req.tenantId, id); }
}
