import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';

import { AUDIT_LOG_KEY, AuditLogDecoratorOptions } from './audit.decorator';
import { AuditService } from './audit.service';

interface RequestWithUser extends Request {
  user?: { id: string } | undefined;
}

/**
 * Interceptor that automatically writes audit log records for handlers
 * decorated with @AuditLog(). If the decorator is not present, the
 * interceptor passes through without side effects.
 */
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly auditService: AuditService
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const auditOptions = this.reflector.get<AuditLogDecoratorOptions | undefined>(
      AUDIT_LOG_KEY,
      context.getHandler()
    );

    if (!auditOptions) {
      return next.handle();
    }

    const httpContext = context.switchToHttp();
    const request = httpContext.getRequest<RequestWithUser>();

    const requestedApi = request.url;
    const ipAddress = request.ip ?? request.socket.remoteAddress;
    const userAgent = request.headers['user-agent'];
    const userId = request.user?.id;

    return next.handle().pipe(
      tap(() => {
        // Fire-and-forget: audit logging should not block the response
        void this.auditService.log({
          requestedApi,
          operationType: auditOptions.operationType,
          severity: auditOptions.severity,
          description: userId
            ? `[userId=${userId}] ${auditOptions.description}`
            : auditOptions.description,
          ipAddress,
          userAgent,
        });
      })
    );
  }
}
