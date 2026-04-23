import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { API_KEY_NAME } from '../decorators/api-key-name.decorator';

@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private configService: ConfigService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const configKey = this.reflector.getAllAndOverride<string>(API_KEY_NAME, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!configKey) {
      throw new UnauthorizedException('API key configuration missing');
    }

    const expected = this.configService.get<string>(configKey);
    if (!expected) {
      throw new UnauthorizedException('API key not configured');
    }

    const request = context.switchToHttp().getRequest();
    const provided =
      request.headers['x-api-key'] || request.headers['X-API-KEY'];

    if (!provided || provided !== expected) {
      throw new UnauthorizedException('Invalid API key');
    }

    return true;
  }
}
