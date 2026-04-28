import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { JwtAuthGuard } from './jwt-auth.guard';
import { ApiKeyGuard } from './api-key.guard';

@Injectable()
export class JwtOrApiKeyGuard implements CanActivate {
  constructor(
    private readonly jwtAuthGuard: JwtAuthGuard,
    private readonly apiKeyGuard: ApiKeyGuard,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const hasApiKey =
      !!request.headers['x-api-key'] || !!request.headers['X-API-KEY'];

    if (hasApiKey) {
      return this.apiKeyGuard.canActivate(context) as boolean;
    }

    return (await this.jwtAuthGuard.canActivate(context)) as boolean;
  }
}
