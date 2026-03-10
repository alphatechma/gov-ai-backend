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

  async create(tenantId: string, dto: DeepPartial<StaffMember> & { createAccess?: boolean; password?: string }) {
    const { createAccess, password, ...staffData } = dto;

    if (createAccess) {
      if (!staffData.email) {
        throw new BadRequestException('E-mail e obrigatorio para criar acesso');
      }
      if (!password || (password as string).length < 6) {
        throw new BadRequestException('Senha com minimo de 6 caracteres e obrigatoria para criar acesso');
      }

      const user = await this.usersService.create({
        name: staffData.name as string,
        email: staffData.email as string,
        password: password as string,
        role: UserRole.ADVISOR,
        tenantId,
        phone: staffData.phone as string,
      });

      staffData.userId = user.id;
    }

    return super.create(tenantId, staffData);
  }
}
