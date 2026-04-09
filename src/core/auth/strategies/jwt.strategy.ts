import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { InjectRepository } from '@nestjs/typeorm';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { Repository } from 'typeorm';
import { User } from '../../users/user.entity';

interface JwtPayload {
  sub: string;
  email: string;
  role: string;
  tenantId: string | null;
  iat?: number;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    configService: ConfigService,
    @InjectRepository(User)
    private usersRepo: Repository<User>,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('JWT_SECRET', 'fallback-secret'),
    });
  }

  async validate(payload: JwtPayload) {
    const user = await this.usersRepo.findOne({
      where: { id: payload.sub },
      relations: ['tenant'],
    });

    if (!user || !user.active) {
      throw new UnauthorizedException('Usuário inativo ou não encontrado');
    }

    if (
      user.sessionsValidAfter &&
      payload.iat &&
      payload.iat * 1000 < user.sessionsValidAfter.getTime()
    ) {
      throw new UnauthorizedException('Sessão revogada, faça login novamente');
    }

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      tenantId: user.tenantId,
      tenant: user.tenant,
      allowedModules: user.allowedModules,
    };
  }
}
