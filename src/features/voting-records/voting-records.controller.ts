import { Controller, Get, Post, Patch, Delete, Body, Param, Req, UseGuards, ParseUUIDPipe } from '@nestjs/common';
import { VotingRecordsService } from './voting-records.service';
import { CreateVotingRecordDto } from './dto/create-voting-record.dto';
import { UpdateVotingRecordDto } from './dto/update-voting-record.dto';
import { JwtAuthGuard } from '../../core/auth/guards/jwt-auth.guard';
import { ModuleAccessGuard } from '../../shared/guards/module-access.guard';
import { RequiresModule } from '../../shared/decorators/requires-module.decorator';

@Controller('voting-records')
@UseGuards(JwtAuthGuard, ModuleAccessGuard)
@RequiresModule('voting-records')
export class VotingRecordsController {
  constructor(private service: VotingRecordsService) {}

  @Get()
  findAll(@Req() req: any) { return this.service.findAll(req.tenantId); }

  @Get(':id')
  findOne(@Req() req: any, @Param('id', ParseUUIDPipe) id: string) { return this.service.findOne(req.tenantId, id); }

  @Post()
  create(@Req() req: any, @Body() dto: CreateVotingRecordDto) { return this.service.create(req.tenantId, dto); }

  @Patch(':id')
  update(@Req() req: any, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateVotingRecordDto) { return this.service.update(req.tenantId, id, dto); }

  @Delete(':id')
  remove(@Req() req: any, @Param('id', ParseUUIDPipe) id: string) { return this.service.remove(req.tenantId, id); }
}
