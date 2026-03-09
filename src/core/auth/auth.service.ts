import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { User } from '../users/user.entity';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { TenantModule } from '../modules/tenant-module.entity';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User)
    private usersRepo: Repository<User>,
    @InjectRepository(TenantModule)
    private tenantModuleRepo: Repository<TenantModule>,
    private jwtService: JwtService,
    private configService: ConfigService,
  ) {}

  async login(dto: LoginDto) {
    const user = await this.usersRepo.findOne({
      where: { email: dto.email },
      relations: ['tenant'],
    });

    if (!user) {
      throw new UnauthorizedException('Credenciais inválidas');
    }

    const passwordValid = await bcrypt.compare(dto.password, user.password);
    if (!passwordValid) {
      throw new UnauthorizedException('Credenciais inválidas');
    }

    if (!user.active) {
      throw new UnauthorizedException('Usuário desativado');
    }

    user.lastLoginAt = new Date();
    await this.usersRepo.save(user);

    const enabledModules = user.tenantId
      ? await this.getEnabledModules(user.tenantId)
      : [];

    const tokens = await this.generateTokens(user, enabledModules);

    return {
      ...tokens,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        tenantId: user.tenantId,
        tenant: user.tenant
          ? {
              id: user.tenant.id,
              name: user.tenant.name,
              slug: user.tenant.slug,
              politicalProfile: user.tenant.politicalProfile,
              logoUrl: user.tenant.logoUrl,
            }
          : null,
        enabledModules,
      },
    };
  }

  async register(dto: RegisterDto) {
    const existing = await this.usersRepo.findOne({
      where: { email: dto.email },
    });
    if (existing) {
      throw new ConflictException('Email já cadastrado');
    }

    const hashedPassword = await bcrypt.hash(dto.password, 10);

    const user = this.usersRepo.create({
      ...dto,
      password: hashedPassword,
    });

    const saved = await this.usersRepo.save(user);

    const { password, ...result } = saved;
    return result;
  }

  async refreshToken(userId: string) {
    const user = await this.usersRepo.findOne({
      where: { id: userId },
      relations: ['tenant'],
    });

    if (!user || !user.active) {
      throw new UnauthorizedException('Usuário inativo ou não encontrado');
    }

    const enabledModules = user.tenantId
      ? await this.getEnabledModules(user.tenantId)
      : [];

    return this.generateTokens(user, enabledModules);
  }

  async getProfile(userId: string) {
    const user = await this.usersRepo.findOne({
      where: { id: userId },
      relations: ['tenant'],
    });
    if (!user) throw new NotFoundException('Usuário não encontrado');

    return {
      id: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      cpf: user.cpf,
      role: user.role,
      avatarUrl: user.avatarUrl,
      tenantId: user.tenantId,
      tenant: user.tenant
        ? { id: user.tenant.id, name: user.tenant.name, slug: user.tenant.slug }
        : null,
      createdAt: user.createdAt,
    };
  }

  async updateProfile(userId: string, dto: UpdateProfileDto) {
    const user = await this.usersRepo.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('Usuário não encontrado');

    if (dto.password) {
      if (!dto.currentPassword) {
        throw new BadRequestException('Senha atual é obrigatória para alterar a senha');
      }
      const valid = await bcrypt.compare(dto.currentPassword, user.password);
      if (!valid) {
        throw new BadRequestException('Senha atual incorreta');
      }
      user.password = await bcrypt.hash(dto.password, 10);
    }

    if (dto.email && dto.email !== user.email) {
      const existing = await this.usersRepo.findOne({ where: { email: dto.email } });
      if (existing) throw new ConflictException('Email já cadastrado');
      user.email = dto.email;
    }

    if (dto.name) user.name = dto.name;
    if (dto.phone !== undefined) user.phone = dto.phone;

    await this.usersRepo.save(user);
    return this.getProfile(userId);
  }

  private async generateTokens(user: User, enabledModules: string[]) {
    const payload = {
      sub: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      tenantId: user.tenantId,
      enabledModules,
    };

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(payload, {
        secret: this.configService.get('JWT_SECRET'),
        expiresIn: this.configService.get('JWT_EXPIRES_IN', '15m'),
      }),
      this.jwtService.signAsync(
        { sub: user.id },
        {
          secret: this.configService.get('JWT_REFRESH_SECRET'),
          expiresIn: this.configService.get('JWT_REFRESH_EXPIRES_IN', '7d'),
        },
      ),
    ]);

    return { accessToken, refreshToken };
  }

  private async getEnabledModules(tenantId: string): Promise<string[]> {
    const modules = await this.tenantModuleRepo.find({
      where: { tenantId, enabled: true },
    });
    return modules.map((m) => m.moduleKey);
  }
}
