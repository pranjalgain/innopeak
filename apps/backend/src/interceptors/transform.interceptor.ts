import { JwtTokenType } from '@auth/enums/jwt-token-type.enum';
import type { AuthUser } from '@auth/types/auth-user.type';
import { MESSAGES } from '@common/constants/messages.constants';
import { ApiResponse } from '@common/dto/api-response';
import type { Locale } from '@common/i18n/locale';
import { resolveRequestLocale } from '@common/i18n/locale';
import { renderMessage, renderNestedMessage } from '@common/i18n/message-registry';
import { RouteNames } from '@common/route-names';
import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Request, Response } from 'express';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

/**
 * Step 1 of the locale resolution order: the authenticated caller's own stored preference,
 * embedded in the access token by `TokenService.signTokenPair`/`signPlatformAdminAccessToken` —
 * a tenant user's `users.locale` or a platform admin's `platform_admins.locale`, whichever
 * principal the token belongs to. `undefined` only for an unauthenticated caller —
 * `resolveRequestLocale` falls through to `Accept-Language` for that case exactly as it does for
 * a signed-in caller who never chose one (`locale: null`).
 */
export function requestUserLocale(request: Request): Locale | null | undefined {
  const user = request.user as AuthUser | undefined;
  if (user?.type === JwtTokenType.TENANT_USER || user?.type === JwtTokenType.PLATFORM_ADMIN) {
    return user.locale;
  }
  return undefined;
}

@Injectable()
export class TransformInterceptor<T> implements NestInterceptor<T, ApiResponse<T>> {
  intercept(context: ExecutionContext, next: CallHandler): Observable<ApiResponse<T>> {
    // Check if the request is an HTTP request
    if (context.getType() === 'http') {
      const request = context.switchToHttp().getRequest<Request>();

      // Exclude specific routes (Prometheus metrics, health checks, and binary downloads that
      // manage their own response via @Res() — a receipt PDF has no ApiResponse<T> shape to wrap).
      const pathname = request.url.split('?')[0] ?? '';
      const isMetricsOrHealth =
        pathname === `/${RouteNames.METRICS}` ||
        pathname === `/v1/${RouteNames.METRICS}` ||
        pathname === `/${RouteNames.HEALTH}` ||
        pathname.startsWith(`/${RouteNames.HEALTH}/`) ||
        pathname === `/v1/${RouteNames.HEALTH}` ||
        pathname.startsWith(`/v1/${RouteNames.HEALTH}/`);
      const isReceiptPdf =
        pathname.includes(`/${RouteNames.BILLING}/${RouteNames.BILLING_RECEIPTS}/`) &&
        pathname.endsWith('/pdf');

      if (isMetricsOrHealth || isReceiptPdf) {
        // These endpoints intentionally bypass response transformation, so the returned stream is
        // genuinely not shaped like `ApiResponse<T>` — `CallHandler.handle()` itself is typed
        // `Observable<any>` by Nest, which is what the linter is (correctly) flagging.
        // eslint-disable-next-line @typescript-eslint/no-unsafe-return
        return next.handle();
      }

      // Resolved once per request, not per field — the same locale renders both `message` below
      // and (via HttpExceptionFilter, on the error path) whatever this request's error response
      // carries, so a client never sees one field in English and another in German.
      const locale = resolveRequestLocale(
        requestUserLocale(request),
        request.headers['accept-language']
      );

      return next.handle().pipe(
        map((data: unknown) => {
          const response = context.switchToHttp().getResponse<Response>();
          const partial =
            typeof data === 'object' && data !== null ? (data as Partial<ApiResponse<T>>) : {};
          const rawMessage = partial.message ?? MESSAGES.COMMON.REQUEST_SUCCESSFUL;
          // `partial.data ?? data` was wrong for an already-wrapped payload whose own `data` is
          // legitimately `null` (e.g. `ResponseUtil.success(null, ...)` for a void mutation): `??`
          // can't tell "the key is present and null" from "the key is absent", so it fell through
          // to `data` — the whole outer envelope — and double-wrapped the response. Checking for
          // the key directly distinguishes the two.
          const hasDataKey = Object.prototype.hasOwnProperty.call(partial, 'data');
          const resolvedData = renderNestedMessage((hasDataKey ? partial.data : data) as T, locale);

          return {
            statusCode: partial.statusCode ?? response.statusCode,
            status: partial.status ?? 'Success',
            message: renderMessage(rawMessage, locale),
            data: resolvedData,
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

    // For other contexts, pass through without modification — same reasoning as the
    // health/metrics bypass above: `CallHandler.handle()` is genuinely `Observable<any>`.
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return next.handle();
  }
}
