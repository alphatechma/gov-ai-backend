import { Controller, Get, Post, Patch, Delete, Body, Param, Req, UseGuards, ParseUUIDPipe } from '@nestjs/common';
import { StaffService } from './staff.service';
import { CreateStaffDto } from './dto/create-staff.dto';
import { UpdateStaffDto } from './dto/update-staff.dto';
import { JwtAuthGuard } from '../../core/auth/guards/jwt-auth.guard';
import { ModuleAccessGuard } from '../../shared/guards/module-access.guard';
import { RequiresModule } from '../../shared/decorators/requires-module.decorator';

@Controller('staff')
@UseGuards(JwtAuthGuard, ModuleAccessGuard)
@RequiresModule('staff')
export class StaffController {
  constructor(private service: StaffService) {}

  @Get()
  findAll(@Req() req: any) { return this.service.findAll(req.tenantId); }

  @Get(':id')
  findOne(@Req() req: any, @Param('id', ParseUUIDPipe) id: string) { return this.service.findOne(req.tenantId, id); }

  @Post()
  create(@Req() req: any, @Body() dto: CreateStaffDto) { return this.service.create(req.tenantId, dto); }

  @Patch(':id')
  update(@Req() req: any, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateStaffDto) { return this.service.update(req.tenantId, id, dto); }

  @Delete(':id')
  remove(@Req() req: any, @Param('id', ParseUUIDPipe) id: string) { return this.service.remove(req.tenantId, id); }
}
