import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { InjectRepository } from '@nestjs/typeorm';
import { Strategy, ExtractJwt } from 'passport-jwt';
import { Request } from 'express';
import { Repository } from 'typeorm';
import { User } from '../../users/user.entity';
import { Subscriber } from '../../subscribers/subscriber.entity';

@Injectable()
export class JwtRefreshStrategy extends PassportStrategy(
  Strategy,
  'jwt-refresh',
) {
  constructor(
    configService: ConfigService,
    @InjectRepository(User)
    private usersRepo: Repository<User>,
    @InjectRepository(Subscriber)
    private subscribersRepo: Repository<Subscriber>,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromBodyField('refreshToken'),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>(
        'JWT_REFRESH_SECRET',
        'fallback-refresh-secret',
      ),
    });
  }

  async validate(payload: { sub: string; iat?: number }) {
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

    if (user.tenantId) {
      const sub = await this.subscribersRepo
        .createQueryBuilder('s')
        .innerJoin('s.user', 'u')
        .where('u.tenantId = :tenantId', { tenantId: user.tenantId })
        .andWhere('s.active = true')
        .getOne();
      if (!sub) {
        throw new UnauthorizedException({
          message: 'Sua assinatura expirou.',
          code: 'SUBSCRIPTION_EXPIRED',
        });
      }
    }

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      tenantId: user.tenantId,
      tenant: user.tenant,
    };
  }
}
