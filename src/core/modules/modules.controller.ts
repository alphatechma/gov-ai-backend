import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ModulesService } from './modules.service';
import { ToggleModuleDto } from './dto/toggle-module.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { UserRole } from '../../shared/enums';

@Controller('modules')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ModulesController {
  constructor(private modulesService: ModulesService) {}

  @Get('my')
  getMyModules(@CurrentUser() user: any) {
    if (!user.tenantId) return [];
    return this.modulesService.findMyModules(user);
  }

  @Get('system')
  @Roles(UserRole.SUPER_ADMIN)
  findAllSystemModules() {
    return this.modulesService.findAllSystemModules();
  }

  @Get('tenant/:tenantId')
  @Roles(UserRole.SUPER_ADMIN)
  findTenantModules(@Param('tenantId', ParseUUIDPipe) tenantId: string) {
    return this.modulesService.findTenantModules(tenantId);
  }

  @Get('tenant/:tenantId/available')
  @Roles(UserRole.SUPER_ADMIN)
  getAvailableModules(@Param('tenantId', ParseUUIDPipe) tenantId: string) {
    return this.modulesService.getAvailableModulesForTenant(tenantId);
  }

  @Post('tenant/:tenantId/toggle')
  @Roles(UserRole.SUPER_ADMIN)
  toggleModule(
    @Param('tenantId', ParseUUIDPipe) tenantId: string,
    @Body() dto: ToggleModuleDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.modulesService.toggleModule(tenantId, dto, userId);
  }
}
