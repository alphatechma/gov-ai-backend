import { Controller, Get, Post, Delete, Body, Param, Query, Req, UseGuards, ParseUUIDPipe, UseInterceptors, UploadedFile } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ElectionProxyService } from './election-proxy.service';
import { JwtAuthGuard } from '../../core/auth/guards/jwt-auth.guard';
import { ModuleAccessGuard } from '../../shared/guards/module-access.guard';
import { RequiresModule } from '../../shared/decorators/requires-module.decorator';

@Controller('election-results')
@UseGuards(JwtAuthGuard, ModuleAccessGuard)
@RequiresModule('election-analysis')
export class ElectionResultsController {
  constructor(private proxy: ElectionProxyService) {}

  // ── Elections (filtrado automaticamente pelo tenant) ──

  @Get('elections')
  listElections(@Req() req: any) {
    const tenant = req.user?.tenant;
    if (tenant) {
      return this.proxy.listElectionsForTenant({
        politicalProfile: tenant.politicalProfile,
        state: tenant.state,
        city: tenant.city,
      });
    }
    return this.proxy.listElections();
  }

  @Delete('elections/:electionId')
  deleteElection(@Param('electionId', ParseUUIDPipe) electionId: string) {
    return this.proxy.deleteElection(electionId);
  }

  // ── Import (via admin) ──

  @Post('elections/import/upload')
  @UseInterceptors(FileInterceptor('file'))
  importUpload(
    @UploadedFile() file: Express.Multer.File,
    @Body() body: { year: string; state: string; municipalityName: string; round?: string },
  ) {
    return this.proxy.importUpload(file.buffer, file.originalname, {
      year: parseInt(body.year, 10),
      state: body.state,
      municipalityName: body.municipalityName,
      round: body.round ? parseInt(body.round, 10) : 1,
    });
  }

  @Get('tse-municipalities')
  getTseMunicipalities(@Query('state') state: string) {
    return this.proxy.getTseMunicipalities(state);
  }

  // ── Analysis (all proxied to election-service) ──

  @Get('elections/:electionId/analysis/summary')
  summary(@Param('electionId', ParseUUIDPipe) id: string, @Query('candidateName') candidateName?: string) {
    return this.proxy.analysis(id, 'summary', { candidateName });
  }

  @Get('elections/:electionId/analysis/by-party')
  byParty(@Param('electionId', ParseUUIDPipe) id: string) {
    return this.proxy.analysis(id, 'by-party');
  }

  @Get('elections/:electionId/analysis/ranking')
  ranking(@Param('electionId', ParseUUIDPipe) id: string, @Query('limit') limit?: string) {
    return this.proxy.analysis(id, 'ranking', { limit });
  }

  @Get('elections/:electionId/analysis/candidates')
  candidates(@Param('electionId', ParseUUIDPipe) id: string) {
    return this.proxy.analysis(id, 'candidates');
  }

  @Get('elections/:electionId/analysis/zones')
  zones(@Param('electionId', ParseUUIDPipe) id: string) {
    return this.proxy.analysis(id, 'zones');
  }

  @Get('elections/:electionId/analysis/by-zone')
  byZone(@Param('electionId', ParseUUIDPipe) id: string, @Query('candidateName') candidateName?: string) {
    return this.proxy.analysis(id, 'by-zone', { candidateName });
  }

  @Get('elections/:electionId/analysis/by-section')
  bySection(@Param('electionId', ParseUUIDPipe) id: string, @Query('zone') zone?: string, @Query('candidateName') candidateName?: string) {
    return this.proxy.analysis(id, 'by-section', { zone, candidateName });
  }

  @Get('elections/:electionId/analysis/section-details')
  sectionDetails(@Param('electionId', ParseUUIDPipe) id: string, @Query('zone') zone?: string) {
    return this.proxy.analysis(id, 'section-details', { zone });
  }

  @Get('elections/:electionId/analysis/candidate-by-zone')
  candidateByZone(@Param('electionId', ParseUUIDPipe) id: string, @Query('candidateName') candidateName: string) {
    return this.proxy.analysis(id, 'candidate-by-zone', { candidateName });
  }

  @Get('elections/:electionId/analysis/candidate-by-section')
  candidateBySection(@Param('electionId', ParseUUIDPipe) id: string, @Query('candidateName') candidateName: string, @Query('zone') zone?: string) {
    return this.proxy.analysis(id, 'candidate-by-section', { candidateName, zone });
  }

  @Get('elections/:electionId/analysis/neighborhoods')
  neighborhoods(@Param('electionId', ParseUUIDPipe) id: string) {
    return this.proxy.analysis(id, 'neighborhoods');
  }

  @Get('elections/:electionId/analysis/by-neighborhood')
  byNeighborhood(@Param('electionId', ParseUUIDPipe) id: string, @Query('candidateName') candidateName?: string) {
    return this.proxy.analysis(id, 'by-neighborhood', { candidateName });
  }

  @Get('elections/:electionId/analysis/neighborhood-details')
  neighborhoodDetails(@Param('electionId', ParseUUIDPipe) id: string, @Query('neighborhood') neighborhood: string) {
    return this.proxy.analysis(id, 'neighborhood-details', { neighborhood });
  }

  @Get('elections/:electionId/analysis/insights')
  insights(@Param('electionId', ParseUUIDPipe) id: string, @Query('candidateName') candidateName?: string) {
    return this.proxy.analysis(id, 'insights', { candidateName });
  }

  @Get('elections/:electionId/analysis/comparison')
  comparison(@Param('electionId', ParseUUIDPipe) id: string, @Query('candidates') candidates: string) {
    return this.proxy.analysis(id, 'comparison', { candidates });
  }

  @Get('elections/:electionId/analysis/projections')
  projections(@Param('electionId', ParseUUIDPipe) id: string, @Query('candidateName') candidateName: string) {
    return this.proxy.analysis(id, 'projections', { candidateName });
  }
}
