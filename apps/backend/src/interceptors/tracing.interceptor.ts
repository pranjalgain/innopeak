import { EnvConfig } from '@config/env.config';
import { CallHandler, ExecutionContext, Injectable, Logger, NestInterceptor } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SpanStatusCode, trace } from '@opentelemetry/api';
import { Request, Response } from 'express';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';

interface TracedErrorDetails {
  statusCode: number;
  message: string;
  name: string;
}

@Injectable()
export class TracingInterceptor implements NestInterceptor {
  private readonly logger = new Logger(TracingInterceptor.name);

  constructor(private readonly configService: ConfigService<EnvConfig>) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    try {
      const request = context.switchToHttp().getRequest<Request>();
      const response = context.switchToHttp().getResponse<Response>();
      const method = request.method;
      const url = request.url;
      const userAgent = request.get('User-Agent') ?? 'unknown';

      // Get the current tracer
      const tracer = trace.getTracer('nestjs-http', '1.0.0');

      // Start a new span for this request
      const span = tracer.startSpan(`${method} ${url}`, {
        attributes: {
          'http.method': method,
          'http.url': url,
          'http.user_agent': userAgent,
          'http.route': url,
          'service.name': 'nestjs-app',
          'service.version': '1.0.0',
          'service.instance.id': this.configService.get<string>('HOSTNAME') ?? 'localhost',
        },
      });

      // Add request ID to span if available
      const requestId = request.headers['x-request-id'];
      if (requestId) {
        span.setAttributes({
          'http.request_id': requestId,
        });
      }

      const startTime = Date.now();

      return next.handle().pipe(
        tap({
          next: (data: unknown) => {
            const duration = Date.now() - startTime;

            // Safely calculate response size
            let responseSize = 0;
            if (data !== undefined && data !== null) {
              try {
                responseSize = JSON.stringify(data).length;
              } catch (_error) {
                // If data can't be stringified (e.g. circular refs), fall back to a safe
                // string representation without relying on the object's own toString().
                responseSize =
                  typeof data === 'string'
                    ? data.length
                    : Object.prototype.toString.call(data).length;
              }
            }

            span.setAttributes({
              'http.status_code': response.statusCode,
              'http.response_time_ms': duration,
              'response.size': responseSize,
            });

            span.setStatus({ code: SpanStatusCode.OK });
            span.end();

            this.logger.debug(`✅ ${method} ${url} - ${response.statusCode} (${duration}ms)`);
          },
          error: (error: unknown) => {
            const duration = Date.now() - startTime;
            const {
              statusCode,
              message: errorMessage,
              name: errorName,
            } = this.extractErrorDetails(error);

            span.setAttributes({
              'http.status_code': statusCode,
              'http.response_time_ms': duration,
              'error.message': errorMessage,
              'error.name': errorName,
            });

            span.setStatus({
              code: SpanStatusCode.ERROR,
              message: errorMessage,
            });
            span.end();

            this.logger.error(
              `❌ ${method} ${url} - ${statusCode} (${duration}ms) - ${errorMessage}`
            );
          },
        })
      );
    } catch (error) {
      this.logger.error('Failed to initialize tracing interceptor:', error);
      // If tracing fails, just return the original observable without tracing
      return next.handle();
    }
  }

  /**
   * Safely extracts status code, message, and name from an unknown thrown error
   * without assuming a particular error shape (HttpException, plain Error, etc.).
   */
  private extractErrorDetails(error: unknown): TracedErrorDetails {
    const record =
      typeof error === 'object' && error !== null ? (error as Record<string, unknown>) : {};
    const status = record['status'];
    const statusCode = record['statusCode'];
    const message = record['message'];
    const name = record['name'];

    return {
      statusCode:
        typeof status === 'number' ? status : typeof statusCode === 'number' ? statusCode : 500,
      message: typeof message === 'string' ? message : 'Unknown error',
      name: typeof name === 'string' ? name : 'Error',
    };
  }
}
