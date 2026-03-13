import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DeepPartial } from 'typeorm';
import { Leader } from './leader.entity';
import { TenantAwareService } from '../../shared/base/tenant-aware.service';
import { UsersService } from '../../core/users/users.service';
import { UserRole } from '../../shared/enums';

@Injectable()
export class LeadersService extends TenantAwareService<Leader> {
  constructor(
    @InjectRepository(Leader) repo: Repository<Leader>,
    private usersService: UsersService,
  ) {
    super(repo);
  }

  async create(
    tenantId: string,
    dto: DeepPartial<Leader> & { createAccess?: boolean; password?: string },
  ) {
    const { createAccess, password, ...leaderData } = dto;

    if (createAccess) {
      if (!leaderData.email) {
        throw new BadRequestException('E-mail e obrigatorio para criar acesso');
      }
      if (!password || password.length < 6) {
        throw new BadRequestException(
          'Senha com minimo de 6 caracteres e obrigatoria para criar acesso',
        );
      }

      const user = await this.usersService.create({
        name: leaderData.name as string,
        email: leaderData.email,
        password: password,
        role: UserRole.LEADER,
        tenantId,
        phone: leaderData.phone as string,
        cpf: leaderData.cpf as string,
      });

      leaderData.userId = user.id;
    }

    return super.create(tenantId, leaderData);
  }
}
