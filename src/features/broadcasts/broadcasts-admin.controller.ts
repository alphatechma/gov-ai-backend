import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import { BroadcastsService } from './broadcasts.service';
import { CreateBroadcastDto } from './dto/create-broadcast.dto';
import { UpdateBroadcastDto } from './dto/update-broadcast.dto';
import { JwtAuthGuard } from '../../core/auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../core/auth/guards/roles.guard';
import { Roles } from '../../core/auth/decorators/roles.decorator';
import { UserRole } from '../../shared/enums';

/**
 * Admin-only controller: /admin/tenants/:tenantId/broadcasts
 * Does NOT require module access (SUPER_ADMIN can always manage campaigns).
 */
@Controller('admin/tenants/:tenantId/broadcasts')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.SUPER_ADMIN)
export class BroadcastsAdminController {
  constructor(private broadcastsService: BroadcastsService) {}

  @Get()
  findAll(@Param('tenantId', ParseUUIDPipe) tenantId: string) {
    return this.broadcastsService.findAll(tenantId);
  }

  @Get(':id')
  findOne(
    @Param('tenantId', ParseUUIDPipe) tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.broadcastsService.findOne(tenantId, id);
  }

  @Post()
  create(
    @Param('tenantId', ParseUUIDPipe) tenantId: string,
    @Body() dto: CreateBroadcastDto,
  ) {
    return this.broadcastsService.create(tenantId, dto);
  }

  @Patch(':id')
  update(
    @Param('tenantId', ParseUUIDPipe) tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateBroadcastDto,
  ) {
    return this.broadcastsService.update(tenantId, id, dto);
  }

  @Delete(':id')
  remove(
    @Param('tenantId', ParseUUIDPipe) tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.broadcastsService.remove(tenantId, id);
  }
}
