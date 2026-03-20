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
import { CabinetVisitsService } from './cabinet-visits.service';
import { CreateCabinetVisitDto } from './dto/create-cabinet-visit.dto';
import { CreateVisitorDto } from './dto/create-visitor.dto';
import { UpdateVisitorDto } from './dto/update-visitor.dto';
import { JwtAuthGuard } from '../../core/auth/guards/jwt-auth.guard';
import { ModuleAccessGuard } from '../../shared/guards/module-access.guard';
import { RequiresModule } from '../../shared/decorators/requires-module.decorator';

@Controller('cabinet-visits')
@UseGuards(JwtAuthGuard, ModuleAccessGuard)
@RequiresModule('cabinet-visits')
export class CabinetVisitsController {
  constructor(private service: CabinetVisitsService) {}

  // ── Dashboard ──

  @Get('dashboard')
  getDashboard(@Req() req: any) {
    return this.service.getDashboardStats(req.user.tenantId);
  }

  // ── Visitors ──

  @Get('visitors/search')
  searchVisitors(@Req() req: any, @Query('q') search: string) {
    return this.service.searchVisitors(req.user.tenantId, search || '');
  }

  @Get('visitors')
  findAllVisitors(
    @Req() req: any,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
  ) {
    return this.service.findAllVisitors(req.user.tenantId, {
      page: page ? +page : undefined,
      limit: limit ? +limit : undefined,
      search,
    });
  }

  @Get('visitors/:id')
  findOneVisitor(@Req() req: any, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.findOneVisitor(req.user.tenantId, id);
  }

  @Get('visitors/:id/check-voter')
  checkVoterMatch(@Req() req: any, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.checkVoterMatch(req.user.tenantId, id);
  }

  @Post('visitors/check-voter')
  checkVoterMatchByData(
    @Req() req: any,
    @Body() body: { name: string; phone?: string },
  ) {
    return this.service.checkVoterMatchByData(
      req.user.tenantId,
      body.name,
      body.phone,
    );
  }

  @Post('visitors')
  createVisitor(@Req() req: any, @Body() dto: CreateVisitorDto) {
    return this.service.createVisitor(req.user.tenantId, dto);
  }

  @Patch('visitors/:id')
  updateVisitor(
    @Req() req: any,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateVisitorDto,
  ) {
    return this.service.updateVisitor(req.user.tenantId, id, dto);
  }

  @Delete('visitors/:id')
  removeVisitor(@Req() req: any, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.removeVisitor(req.user.tenantId, id);
  }

  // ── Cabinet Visits ──

  @Get()
  findAll(
    @Req() req: any,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
  ) {
    return this.service.findAllPaginated(req.user.tenantId, {
      page: page ? +page : undefined,
      limit: limit ? +limit : undefined,
      search,
      dateFrom,
      dateTo,
    });
  }

  @Get(':id')
  findOne(@Req() req: any, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.findOneCabinetVisit(req.user.tenantId, id);
  }

  @Post()
  create(@Req() req: any, @Body() dto: CreateCabinetVisitDto) {
    return this.service.createCabinetVisit(req.user.tenantId, dto);
  }

  @Delete(':id')
  remove(@Req() req: any, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.removeCabinetVisit(req.user.tenantId, id);
  }
}
