import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { DashboardService } from './dashboard.service';
import { JwtAuthGuard } from '../../core/auth/guards/jwt-auth.guard';
import { ModuleAccessGuard } from '../../shared/guards/module-access.guard';
import { RequiresModule } from '../../shared/decorators/requires-module.decorator';

@Controller('dashboard')
@UseGuards(JwtAuthGuard, ModuleAccessGuard)
@RequiresModule('dashboard')
export class DashboardController {
  constructor(private dashboardService: DashboardService) {}

  @Get('stats')
  getStats(@Req() req: any) {
    return this.dashboardService.getStats(req.tenantId);
  }

  @Get('quick-actions')
  getQuickActions(@Req() req: any) {
    return this.dashboardService.getQuickActions(req.tenantId);
  }

  @Get('birthdays')
  getBirthdays(@Req() req: any) {
    return this.dashboardService.getBirthdays(req.tenantId);
  }

  @Get('chart-data')
  getChartData(@Req() req: any, @Query('period') period?: string) {
    return this.dashboardService.getChartData(
      req.tenantId,
      period ? parseInt(period, 10) : 30,
    );
  }

  @Get('insights')
  getInsights(@Req() req: any) {
    return this.dashboardService.getInsights(req.tenantId);
  }

  @Get('recent-activity')
  getRecentActivity(@Req() req: any) {
    return this.dashboardService.getRecentActivity(req.tenantId);
  }

  @Get('tasks-summary')
  getTasksSummary(@Req() req: any) {
    return this.dashboardService.getTasksSummary(req.tenantId);
  }

  @Get('help-records-summary')
  getHelpRecordsSummary(@Req() req: any) {
    return this.dashboardService.getHelpRecordsSummary(req.tenantId);
  }
}
