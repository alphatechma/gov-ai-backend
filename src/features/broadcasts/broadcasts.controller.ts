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
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import { BroadcastsService } from './broadcasts.service';
import { CreateBroadcastDto } from './dto/create-broadcast.dto';
import { UpdateBroadcastDto } from './dto/update-broadcast.dto';
import { JwtAuthGuard } from '../../core/auth/guards/jwt-auth.guard';
import { ModuleAccessGuard } from '../../shared/guards/module-access.guard';
import { RequiresModule } from '../../shared/decorators/requires-module.decorator';

@Controller('broadcasts')
@UseGuards(JwtAuthGuard, ModuleAccessGuard)
@RequiresModule('whatsapp')
export class BroadcastsController {
  constructor(private broadcastsService: BroadcastsService) {}

  @Get()
  findAll(
    @Req() req: any,
    /** O admin passa tenantId como query param; usuários normais usam o próprio tenantId do token */
    @Query('tenantId') tenantIdParam?: string,
  ) {
    const tenantId = tenantIdParam ?? req.tenantId;
    return this.broadcastsService.findAll(tenantId);
  }

  @Get(':id')
  findOne(
    @Req() req: any,
    @Param('id', ParseUUIDPipe) id: string,
    @Query('tenantId') tenantIdParam?: string,
  ) {
    const tenantId = tenantIdParam ?? req.tenantId;
    return this.broadcastsService.findOne(tenantId, id);
  }

  @Post()
  create(@Req() req: any, @Body() dto: CreateBroadcastDto) {
    return this.broadcastsService.create(req.tenantId, dto);
  }

  @Patch(':id')
  update(
    @Req() req: any,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateBroadcastDto,
  ) {
    return this.broadcastsService.update(req.tenantId, id, dto);
  }

  @Delete(':id')
  remove(@Req() req: any, @Param('id', ParseUUIDPipe) id: string) {
    return this.broadcastsService.remove(req.tenantId, id);
  }
}
