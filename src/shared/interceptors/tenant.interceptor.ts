import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { UserRole } from '../enums';

@Injectable()
export class TenantInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user) return next.handle();

    if (user.role === UserRole.SUPER_ADMIN) {
      request.tenantId = request.headers['x-tenant-id'] || null;
    } else {
      request.tenantId = user.tenantId;
    }

    return next.handle();
  }
}
