import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { context, trace } from '@opentelemetry/api';
import { Response } from 'express';
import { Observable } from 'rxjs';
import { catchError, tap } from 'rxjs/operators';

@Injectable()
export class TraceIdInterceptor implements NestInterceptor {
  intercept(context_: ExecutionContext, next: CallHandler): Observable<unknown> {
    const ctx = context.active();
    const span = trace.getSpan(ctx);
    const traceId = span?.spanContext().traceId;
    const spanId = span?.spanContext().spanId;
    const response = context_.switchToHttp().getResponse<Response>();
    if (traceId) response.setHeader('x-trace-id', traceId);
    if (spanId) response.setHeader('x-span-id', spanId);

    return next.handle().pipe(
      tap(() => {
        // No-op: headers already set
      }),
      catchError((err: unknown) => {
        if (traceId) response.setHeader('x-trace-id', traceId);
        if (spanId) response.setHeader('x-span-id', spanId);
        throw err;
      })
    );
  }
}
