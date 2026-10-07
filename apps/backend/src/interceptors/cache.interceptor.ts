import { CACHE_MANAGER } from '@nestjs/cache-manager';
import {
  CallHandler,
  ExecutionContext,
  Inject,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { Cache } from 'cache-manager';
import { Request } from 'express';
import { Observable, of } from 'rxjs';
import { tap } from 'rxjs/operators';

import * as crypto from 'crypto';

@Injectable()
export class ClientControlledCacheInterceptor implements NestInterceptor {
  private readonly logger = new Logger(ClientControlledCacheInterceptor.name);

  constructor(@Inject(CACHE_MANAGER) private readonly cacheManager: Cache) {}

  async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<unknown>> {
    const cacheControl = this.getCacheControl(context);

    if (cacheControl === 'no-store') {
      return next.handle();
    }

    const key = this.generateCacheKey(context);
    const cachedResponse = await this.cacheManager.get(key);
    if (cachedResponse) {
      return of(cachedResponse);
    }

    return next.handle().pipe(
      tap(response => {
        if (cacheControl !== 'no-cache') {
          const ttl = this.parseCacheControl(cacheControl);
          void this.cacheManager.set(key, response, ttl).catch((error: unknown) => {
            this.logger.error('Failed to store response in cache', error);
          });
        }
      })
    );
  }

  private getCacheControl(context: ExecutionContext): string {
    const contextType = context.getType();

    if (contextType === 'http') {
      const request = context.switchToHttp().getRequest<Request>();
      return request.headers['cache-control'] ?? '';
    } else if (contextType === 'rpc') {
      const data = context.switchToRpc().getData<{ cacheControl?: string }>();
      return data.cacheControl ?? '';
    } else {
      const args = context.getArgByIndex<{ cacheControl?: string }>(1);
      return args.cacheControl ?? '';
    }
  }

  private generateCacheKey(context: ExecutionContext): string {
    const contextType = context.getType();
    let keyData = '';

    if (contextType === 'http') {
      const request = context.switchToHttp().getRequest<Request>();
      keyData = `${request.method}:${request.url}:${JSON.stringify(request.params)}:${JSON.stringify(
        request.query
      )}:${JSON.stringify(request.body)}`;
    } else if (contextType === 'rpc') {
      const data = context.switchToRpc().getData<unknown>();
      keyData = `rpc:${JSON.stringify(data)}`;
    } else {
      const args = context.getArgByIndex<unknown>(0);
      keyData = `graphql:${JSON.stringify(args)}`;
    }

    return crypto.createHash('md5').update(keyData).digest('hex');
  }

  private parseCacheControl(cacheControl: string): number {
    const defaultTtlMs = 5 * 60 * 1000; // 5 minutes

    if (!cacheControl) return defaultTtlMs;

    const maxAgeMatch = cacheControl.match(/max-age=(\d+)/);

    if (maxAgeMatch?.[1]) {
      const maxAgeSeconds = parseInt(maxAgeMatch[1], 10);
      return maxAgeSeconds * 1000;
    }

    return defaultTtlMs;
  }
}
