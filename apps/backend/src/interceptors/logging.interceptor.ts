import { safeReferrer, safeUrl } from '@common/helpers/safe-url.util';
import { LoggerService } from '@logger/logger.service';
import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Request, Response } from 'express';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';

/** Matched case-insensitively anywhere in a body or query. Keyed on field name, not route, so a new endpoint can't opt out by accident. */
const REDACTED_FIELDS = new Set([
  'password',
  'currentpassword',
  'newpassword',
  'confirmpassword',
  'otp',
  'token',
  'accesstoken',
  'refreshtoken',
  'code',
  'state',
  'secret',
  'authorization',
]);

const REDACTED = '[REDACTED]';

/** Depth-limited so a hostile or accidentally-cyclic body cannot spin here. */
function redact(value: unknown, depth = 0): unknown {
  if (depth > 6 || value === null || typeof value !== 'object') {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map(item => redact(item, depth + 1));
  }

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, item]) => [
      key,
      REDACTED_FIELDS.has(key.toLowerCase()) ? REDACTED : redact(item, depth + 1),
    ])
  );
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(redact(value));
  } catch {
    return '[unserializable]';
  }
}

@Injectable()
export class HttpLoggingInterceptor implements NestInterceptor {
  constructor(private readonly logger: LoggerService) {}

  intercept(context_: ExecutionContext, next: CallHandler): Observable<unknown> {
    const httpContext = context_.switchToHttp();
    const request = httpContext.getRequest<Request>();
    const response = httpContext.getResponse<Response>();

    const { method, url, httpVersion, headers, query } = request;
    const body: unknown = request.body;
    const remoteAddr = request.ip ?? request.socket.remoteAddress;
    const userAgent = headers['user-agent'] ?? 'unknown';
    const refererValue = headers['referer'] ?? headers['referrer'] ?? 'No Referer';
    const referrer = safeReferrer(
      Array.isArray(refererValue) ? refererValue.join(', ') : refererValue
    );
    const startTime = new Date().toISOString();
    const startTimestamp = Date.now();

    return next.handle().pipe(
      tap(() => {
        const endTimestamp = Date.now();
        const endTime = new Date().toISOString();
        const responseTime = endTimestamp - startTimestamp;
        const { statusCode } = response;
        const contentLength = response.get('content-length') ?? 'unknown';

        this.logger.http(
          'HTTP Log\n' +
            `Start: ${startTime}, End: ${endTime}, Duration: ${responseTime}ms\n` +
            `Remote: ${remoteAddr}, Method: ${method}, URL: ${safeUrl(url)}, HTTP/${httpVersion}\n` +
            `User-Agent: ${userAgent}, Referrer: ${referrer}\n` +
            `Body: ${safeStringify(body)}, Query: ${safeStringify(query)}\n` +
            `Status: ${statusCode}, Content-Length: ${contentLength}\n`,
          'HTTP'
        );
      })
    );
  }
}
