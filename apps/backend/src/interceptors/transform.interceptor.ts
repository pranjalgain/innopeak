import { ApiResponse } from '@common/dto/api-response';
import { RouteNames } from '@common/route-names';
import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Request, Response } from 'express';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

@Injectable()
export class TransformInterceptor<T> implements NestInterceptor<T, ApiResponse<T>> {
  intercept(context: ExecutionContext, next: CallHandler): Observable<ApiResponse<T>> {
    // Check if the request is an HTTP request
    if (context.getType() === 'http') {
      const request = context.switchToHttp().getRequest<Request>();

      // Exclude specific routes
      if (request.url.includes(RouteNames.METRICS) || request.url.includes(RouteNames.HEALTH)) {
        // Health/metrics endpoints intentionally bypass response transformation.
        return next.handle() as unknown as Observable<ApiResponse<T>>;
      }

      return next.handle().pipe(
        map((data: unknown) => {
          const response = context.switchToHttp().getResponse<Response>();
          const partial =
            typeof data === 'object' && data !== null ? (data as Partial<ApiResponse<T>>) : {};

          return {
            statusCode: partial.statusCode ?? response.statusCode,
            status: partial.status ?? 'Success',
            message: partial.message ?? 'Request successful',
            data: (partial.data ?? data) as T,
            ...(partial.error !== undefined ? { error: partial.error } : {}),
          };
        })
      );
    }

    if (context.getType().toString() === 'graphql') {
      return next.handle().pipe(
        map((data: unknown) => ({
          statusCode: 200,
          status: 'Success',
          message: 'Request successful',
          data: data as T,
          error: '',
        }))
      );
    }

    // For other contexts, pass through without modification.
    return next.handle() as unknown as Observable<ApiResponse<T>>;
  }
}
