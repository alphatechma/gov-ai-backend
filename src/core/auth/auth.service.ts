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
import { Subscriber } from '../subscribers/subscriber.entity';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User)
    private usersRepo: Repository<User>,
    @InjectRepository(TenantModule)
    private tenantModuleRepo: Repository<TenantModule>,
    @InjectRepository(Subscriber)
    private subscribersRepo: Repository<Subscriber>,
    private jwtService: JwtService,
    private configService: ConfigService,
  ) {}

  private async ensureActiveSubscription(tenantId: string | null): Promise<void> {
    if (!tenantId) return;
    const sub = await this.subscribersRepo
      .createQueryBuilder('s')
      .innerJoin('s.user', 'u')
      .where('u.tenantId = :tenantId', { tenantId })
      .andWhere('s.active = true')
      .getOne();
    if (!sub) {
      throw new UnauthorizedException({
        message:
          'Sua assinatura expirou. Regularize o pagamento para continuar.',
        code: 'SUBSCRIPTION_EXPIRED',
      });
    }
  }

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

    await this.ensureActiveSubscription(user.tenantId);

    user.lastLoginAt = new Date();
    await this.usersRepo.save(user);

    let enabledModules = user.tenantId
      ? await this.getEnabledModules(user.tenantId)
      : [];

    if (user.allowedModules && user.allowedModules.length > 0) {
      const allowed = user.allowedModules;
      enabledModules = enabledModules.filter((m) => allowed.includes(m));
    }

    const tokens = await this.generateTokens(user, enabledModules);

    return {
      ...tokens,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        tenantId: user.tenantId,
        allowedModules: user.allowedModules,
        tenant: user.tenant
          ? {
              id: user.tenant.id,
              name: user.tenant.name,
              slug: user.tenant.slug,
              politicalProfile: user.tenant.politicalProfile,
              logoUrl: user.tenant.logoUrl,
              bannerUrl: user.tenant.bannerUrl,
              faviconUrl: user.tenant.faviconUrl,
              appName: user.tenant.appName,
              primaryColor: user.tenant.primaryColor,
              primaryColorDark: user.tenant.primaryColorDark,
              loginBgColor: user.tenant.loginBgColor,
              loginBgColorEnd: user.tenant.loginBgColorEnd,
              dashboardBannerUrl: user.tenant.dashboardBannerUrl,
              sidebarColor: user.tenant.sidebarColor,
              headerColor: user.tenant.headerColor,
              fontFamily: user.tenant.fontFamily,
              borderRadius: user.tenant.borderRadius,
              showBannerInSidebar: user.tenant.showBannerInSidebar,
              sidebarBannerPosition: user.tenant.sidebarBannerPosition,
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

    await this.ensureActiveSubscription(user.tenantId);

    let enabledModules = user.tenantId
      ? await this.getEnabledModules(user.tenantId)
      : [];

    if (user.allowedModules && user.allowedModules.length > 0) {
      const allowed = user.allowedModules;
      enabledModules = enabledModules.filter((m) => allowed.includes(m));
    }

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
        throw new BadRequestException(
          'Senha atual é obrigatória para alterar a senha',
        );
      }
      const valid = await bcrypt.compare(dto.currentPassword, user.password);
      if (!valid) {
        throw new BadRequestException('Senha atual incorreta');
      }
      user.password = await bcrypt.hash(dto.password, 10);
    }

    if (dto.email && dto.email !== user.email) {
      const existing = await this.usersRepo.findOne({
        where: { email: dto.email },
      });
      if (existing) throw new ConflictException('Email já cadastrado');
      user.email = dto.email;
    }

    if (dto.name) user.name = dto.name;
    if (dto.phone !== undefined) user.phone = dto.phone;

    await this.usersRepo.save(user);
    return this.getProfile(userId);
  }

  async kickAllSessions(exceptUserId?: string) {
    const now = new Date();
    const qb = this.usersRepo
      .createQueryBuilder()
      .update(User)
      .set({ sessionsValidAfter: now });
    if (exceptUserId) {
      qb.where('id != :exceptUserId', { exceptUserId });
    }
    const result = await qb.execute();
    return { affected: result.affected ?? 0, sessionsValidAfter: now };
  }

  async kickTenantSessions(tenantId: string, exceptUserId?: string) {
    if (!tenantId) {
      throw new BadRequestException('tenantId é obrigatório');
    }
    const now = new Date();
    const qb = this.usersRepo
      .createQueryBuilder()
      .update(User)
      .set({ sessionsValidAfter: now })
      .where('tenantId = :tenantId', { tenantId });
    if (exceptUserId) {
      qb.andWhere('id != :exceptUserId', { exceptUserId });
    }
    const result = await qb.execute();
    return { affected: result.affected ?? 0, sessionsValidAfter: now };
  }

  async kickUserSession(userId: string) {
    const user = await this.usersRepo.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('Usuário não encontrado');
    }
    const now = new Date();
    user.sessionsValidAfter = now;
    await this.usersRepo.save(user);
    return { affected: 1, sessionsValidAfter: now };
  }

  private async generateTokens(user: User, enabledModules: string[]) {
    const payload = {
      sub: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      tenantId: user.tenantId,
      enabledModules,
      allowedModules: user.allowedModules,
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
