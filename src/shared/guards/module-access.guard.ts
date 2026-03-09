import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MODULE_KEY } from '../decorators/requires-module.decorator';
import { TenantModule } from '../../core/modules/tenant-module.entity';
import { UserRole } from '../enums';

@Injectable()
export class ModuleAccessGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    @InjectRepository(TenantModule)
    private tenantModuleRepo: Repository<TenantModule>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredModule = this.reflector.getAllAndOverride<string>(
      MODULE_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredModule) return true;

    const { user } = context.switchToHttp().getRequest();

    if (user.role === UserRole.SUPER_ADMIN) return true;

    const tenantModule = await this.tenantModuleRepo.findOne({
      where: {
        tenantId: user.tenantId,
        moduleKey: requiredModule,
        enabled: true,
      },
    });

    if (!tenantModule) {
      throw new ForbiddenException(
        `Módulo "${requiredModule}" não está disponível para este tenant`,
      );
    }

    return true;
  }
}
