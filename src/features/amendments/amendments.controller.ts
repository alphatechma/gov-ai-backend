import { Controller, Get, Post, Patch, Delete, Body, Param, Req, UseGuards, ParseUUIDPipe } from '@nestjs/common';
import { AmendmentsService } from './amendments.service';
import { CreateAmendmentDto } from './dto/create-amendment.dto';
import { UpdateAmendmentDto } from './dto/update-amendment.dto';
import { JwtAuthGuard } from '../../core/auth/guards/jwt-auth.guard';
import { ModuleAccessGuard } from '../../shared/guards/module-access.guard';
import { RequiresModule } from '../../shared/decorators/requires-module.decorator';

@Controller('amendments')
@UseGuards(JwtAuthGuard, ModuleAccessGuard)
@RequiresModule('amendments')
export class AmendmentsController {
  constructor(private service: AmendmentsService) {}

  @Get()
  findAll(@Req() req: any) { return this.service.findAll(req.tenantId); }

  @Get(':id')
  findOne(@Req() req: any, @Param('id', ParseUUIDPipe) id: string) { return this.service.findOne(req.tenantId, id); }

  @Post()
  create(@Req() req: any, @Body() dto: CreateAmendmentDto) { return this.service.create(req.tenantId, dto); }

  @Patch(':id')
  update(@Req() req: any, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateAmendmentDto) { return this.service.update(req.tenantId, id, dto); }

  @Delete(':id')
  remove(@Req() req: any, @Param('id', ParseUUIDPipe) id: string) { return this.service.remove(req.tenantId, id); }
}
