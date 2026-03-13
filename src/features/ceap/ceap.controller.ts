import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Req,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import { CeapService } from './ceap.service';
import { CreateCeapDto } from './dto/create-ceap.dto';
import { UpdateCeapDto } from './dto/update-ceap.dto';
import { JwtAuthGuard } from '../../core/auth/guards/jwt-auth.guard';
import { ModuleAccessGuard } from '../../shared/guards/module-access.guard';
import { RequiresModule } from '../../shared/decorators/requires-module.decorator';

@Controller('ceap')
@UseGuards(JwtAuthGuard, ModuleAccessGuard)
@RequiresModule('ceap')
export class CeapController {
  constructor(private service: CeapService) {}

  @Get()
  findAll(@Req() req: any) {
    return this.service.findAll(req.tenantId);
  }

  @Get('summary')
  getSummary(@Req() req: any) {
    return this.service.getSummary(req.tenantId);
  }

  @Get('monthly-chart')
  getMonthlyChart(@Req() req: any) {
    return this.service.getMonthlyChart(req.tenantId);
  }

  @Get('totals-by-category')
  getTotalsByCategory(@Req() req: any) {
    return this.service.getTotalsByCategory(req.tenantId);
  }

  @Get(':id')
  findOne(@Req() req: any, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.findOne(req.tenantId, id);
  }

  @Post()
  create(@Req() req: any, @Body() dto: CreateCeapDto) {
    return this.service.create(req.tenantId, dto);
  }

  @Patch(':id')
  update(
    @Req() req: any,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCeapDto,
  ) {
    return this.service.update(req.tenantId, id, dto);
  }

  @Delete(':id')
  remove(@Req() req: any, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.remove(req.tenantId, id);
  }
}
