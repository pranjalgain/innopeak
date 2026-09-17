import { getTraceContext } from '@common/helpers/trace-context.util';
import { LoggerService } from '@logger/logger.service';
import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Request, Response } from 'express';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';

/**
 * Field names whose values never belong in a log line, matched case-insensitively anywhere in a
 * request body or query string.
 *
 * Keyed on the field name rather than the route so a new endpoint cannot opt out by accident: this
 * interceptor logged `JSON.stringify(body)` verbatim for every request, which put plaintext
 * passwords, `newPassword`, and verification OTPs into the rotating log files and Loki for every
 * non-production environment (the `http` level is suppressed only when NODE_ENV=production).
 */
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

/** Path segments whose *next* segment is a secret rather than an identifier — an invite token,
 *  reached at `invite/:token` (`AuthController`/`PlatformAdminAuthController`, both mounted the
 *  same way) — never the literal `accept` (`invite/accept`, whose token travels in the body and is
 *  already covered by `REDACTED_FIELDS`), so that segment is left as-is for readability. */
const REDACTS_NEXT_PATH_SEGMENT = new Set(['invite']);

/** The one segment `REDACTS_NEXT_PATH_SEGMENT` deliberately does not redact — see its own comment. */
const NON_SECRET_NEXT_PATH_SEGMENT = 'accept';

/**
 * `request.url` was logged verbatim below `body`/`query`'s redacted copies, which missed two paths
 * a secret actually travels by: the invite token as a `:token` path segment
 * (`GET /v1/auth/invite/:token`, `.../invite/:token/google`, and the admin equivalents), and the
 * Google OAuth `code`/`state` on `GET /v1/auth/google/callback`, sent as query-string parameters —
 * `REDACTED_FIELDS` only ever reached the parsed `query` object logged separately, never this raw
 * string. Dropping the query string here (it is already logged, redacted, via `Query: ...`) and
 * redacting flagged path segments closes both without touching what `redact()` already handles.
 */
function safeUrl(url: string): string {
  const [pathname = url] = url.split('?', 1);
  const segments = pathname.split('/');

  for (let i = 1; i < segments.length; i++) {
    if (
      REDACTS_NEXT_PATH_SEGMENT.has(segments[i - 1] ?? '') &&
      segments[i] !== NON_SECRET_NEXT_PATH_SEGMENT
    ) {
      segments[i] = REDACTED;
    }
  }

  return segments.join('/');
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
    const referrer = Array.isArray(refererValue) ? refererValue.join(', ') : refererValue;
    const startTime = new Date().toISOString();
    const startTimestamp = Date.now();
    const { traceId, spanId } = getTraceContext();
    const contextInfo = `[TraceId=${traceId ?? 'unknown-trace'} | SpanId=${spanId ?? 'unknown-span'}]`;

    return next.handle().pipe(
      tap(() => {
        const endTimestamp = Date.now();
        const endTime = new Date().toISOString();
        const responseTime = endTimestamp - startTimestamp;
        const { statusCode } = response;
        const contentLength = response.get('content-length') ?? 'unknown';

        this.logger.http(
          `HTTP Log ${contextInfo}\n` +
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
