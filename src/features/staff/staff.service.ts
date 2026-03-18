import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DeepPartial } from 'typeorm';
import { StaffMember } from './staff.entity';
import { TenantAwareService } from '../../shared/base/tenant-aware.service';
import { UsersService } from '../../core/users/users.service';
import { UserRole } from '../../shared/enums';

@Injectable()
export class StaffService extends TenantAwareService<StaffMember> {
  constructor(
    @InjectRepository(StaffMember) repo: Repository<StaffMember>,
    private usersService: UsersService,
  ) {
    super(repo);
  }

  async create(
    tenantId: string,
    dto: DeepPartial<StaffMember> & {
      createAccess?: boolean;
      password?: string;
      accessRole?: UserRole;
      allowedModules?: string[];
    },
  ) {
    const { createAccess, password, accessRole, allowedModules, ...staffData } =
      dto;

    if (createAccess) {
      if (!staffData.email) {
        throw new BadRequestException('E-mail e obrigatorio para criar acesso');
      }
      if (!password || password.length < 6) {
        throw new BadRequestException(
          'Senha com minimo de 6 caracteres e obrigatoria para criar acesso',
        );
      }

      const role = accessRole || UserRole.ADVISOR;

      let modules: string[] | undefined = allowedModules;
      if (role === UserRole.ATTENDANT) {
        modules = modules && modules.length > 0 ? modules : ['visits'];
      }

      const user = await this.usersService.create({
        name: staffData.name as string,
        email: staffData.email,
        password: password,
        role,
        tenantId,
        phone: staffData.phone as string,
        allowedModules: modules,
      });

      staffData.userId = user.id;
    }

    return super.create(tenantId, staffData);
  }
}
