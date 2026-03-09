import {
  Controller,
  Get,
  Post,
  Body,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { ReportsService } from './reports.service';
import { GenerateReportDto, ReportFormat } from './dto/generate-report.dto';
import { JwtAuthGuard } from '../../core/auth/guards/jwt-auth.guard';
import { ModuleAccessGuard } from '../../shared/guards/module-access.guard';
import { RequiresModule } from '../../shared/decorators/requires-module.decorator';

@Controller('reports')
@UseGuards(JwtAuthGuard, ModuleAccessGuard)
@RequiresModule('reports')
export class ReportsController {
  constructor(private reportsService: ReportsService) {}

  @Get('summary')
  getSummary(@Req() req: any) {
    return this.reportsService.getSummary(req.tenantId);
  }

  @Post('generate')
  async generate(
    @Req() req: any,
    @Res({ passthrough: true }) res: Response,
    @Body() dto: GenerateReportDto,
  ) {
    const result = await this.reportsService.generate(req.tenantId, dto);

    if (dto.format === ReportFormat.CSV && 'csv' in result) {
      res.set({
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${result.filename}"`,
      });
      return result.csv;
    }

    return result;
  }
}
