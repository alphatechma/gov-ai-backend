import { Controller, Post, Body, Req, UseGuards } from '@nestjs/common';
import { AiService } from './ai.service';
import {
  AiChatDto,
  AnalyzeElectionDto,
  CompareElectionsDto,
  SimulateScenarioDto,
  AnalyzeProjectionDto,
} from './dto/ai.dto';
import { JwtAuthGuard } from '../../core/auth/guards/jwt-auth.guard';
import { ModuleAccessGuard } from '../../shared/guards/module-access.guard';
import { RequiresModule } from '../../shared/decorators/requires-module.decorator';

@Controller('ai')
@UseGuards(JwtAuthGuard, ModuleAccessGuard)
@RequiresModule('ai')
export class AiController {
  constructor(private aiService: AiService) {}

  private getTenantContext(req: any) {
    return {
      tenantName: req.user.tenant?.name || req.user.name,
      politicalProfile: req.user.tenant?.politicalProfile || 'VEREADOR',
      state: req.user.tenant?.state || '',
      city: req.user.tenant?.city,
      party: req.user.tenant?.party,
    };
  }

  @Post('chat')
  chat(@Req() req: any, @Body() dto: AiChatDto) {
    return this.aiService.chat(dto, this.getTenantContext(req), req.tenantId);
  }

  @Post('analyze')
  analyzeElection(@Req() req: any, @Body() dto: AnalyzeElectionDto) {
    return this.aiService.analyzeElection(dto, this.getTenantContext(req));
  }

  @Post('compare')
  compareElections(@Req() req: any, @Body() dto: CompareElectionsDto) {
    return this.aiService.compareElections(dto, this.getTenantContext(req));
  }

  @Post('simulate')
  simulateScenario(@Req() req: any, @Body() dto: SimulateScenarioDto) {
    return this.aiService.simulateScenario(dto, this.getTenantContext(req));
  }

  @Post('projection')
  analyzeProjection(@Req() req: any, @Body() dto: AnalyzeProjectionDto) {
    return this.aiService.analyzeProjection(dto, this.getTenantContext(req));
  }
}
