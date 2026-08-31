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

  /**
   * Intercepts incoming requests and handles caching logic based on cache-control headers or directives.
   * If the response is cached, it returns the cached response; otherwise, it stores the response in the cache.
   *
   * @param context - The execution context of the current request (HTTP, RPC, or GraphQL).
   * @param next - The next handler in the request-response chain.
   * @returns Observable<unknown> - The response, either from cache or freshly generated.
   */
  async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<unknown>> {
    const cacheControl = this.getCacheControl(context);

    // If the cache control is 'no-store',
    // bypass caching and return fresh response.
    if (cacheControl === 'no-store') {
      return next.handle();
    }

    const key = this.generateCacheKey(context);
    const cachedResponse = await this.cacheManager.get(key);
    if (cachedResponse) {
      return of(cachedResponse);
    }

    // Handle the request and cache the response if cache control permits.
    return next.handle().pipe(
      tap(response => {
        // Cache the response unless cache control is 'no-cache'.
        if (cacheControl !== 'no-cache') {
          // Determine the TTL(milliseconds) based on cache-control
          const ttl = this.parseCacheControl(cacheControl);
          void this.cacheManager.set(key, response, ttl).catch((error: unknown) => {
            this.logger.error('Failed to store response in cache', error);
          });
        }
      })
    );
  }

  /**
   * Extracts the cache-control directive from the request context.
   * Supports HTTP, RPC, and GraphQL request types.
   *
   * @param context - The execution context (HTTP, RPC, or GraphQL).
   * @returns string - The value of the cache-control directive.
   */
  private getCacheControl(context: ExecutionContext): string {
    const contextType = context.getType();

    if (contextType === 'http') {
      // Handle HTTP requests (e.g., from REST controllers).
      const request = context.switchToHttp().getRequest<Request>();
      return request.headers['cache-control'] ?? '';
    } else if (contextType === 'rpc') {
      // Handle RPC requests (e.g., from gRPC).
      const data = context.switchToRpc().getData<{ cacheControl?: string }>();
      return data.cacheControl ?? '';
    } else {
      // Handle GraphQL requests.
      const args = context.getArgByIndex<{ cacheControl?: string }>(1);
      return args.cacheControl ?? '';
    }
  }

  /**
   * Generates a unique cache key based on the request path, method, and parameters.
   * Uses a cryptographic hash to ensure uniqueness and prevent collisions.
   *
   * @param context - The execution context (HTTP, RPC, or GraphQL).
   * @returns string - The generated unique cache key.
   */
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

    // Return a hashed key to avoid overly long keys.
    return crypto.createHash('md5').update(keyData).digest('hex');
  }

  /**
   * Parses the cache-control directive to extract the 'max-age' value and convert it to TTL (Time to Live).
   * If no valid max-age is found, a default TTL of 300,000 milliseconds (5 minutes) is returned.
   *
   * @param cacheControl - The cache-control directive from the client request.
   * @returns number - The TTL (in milliseconds) to store the cached response.
   */
  private parseCacheControl(cacheControl: string): number {
    const defaultTtlMs = 5 * 60 * 1000; // Default - 5 minutes (milliseconds)

    if (!cacheControl) return defaultTtlMs;

    // Extract the max-age value from the cache-control directive.
    const maxAgeMatch = cacheControl.match(/max-age=(\d+)/);

    // If max-age is provided and is a valid number, convert it to milliseconds.
    if (maxAgeMatch?.[1]) {
      const maxAgeSeconds = parseInt(maxAgeMatch[1], 10);
      return maxAgeSeconds * 1000; // Convert seconds to milliseconds
    }

    // Return the default TTL if no valid max-age is found.
    return defaultTtlMs;
  }
}
