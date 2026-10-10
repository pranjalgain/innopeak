import { JwtTokenType } from '@auth/enums/jwt-token-type.enum';
import type { AuthUser } from '@auth/types/auth.type';
import { MESSAGES } from '@common/constants/messages.constants';
import { ApiResponse } from '@common/dto/api-response';
import type { Locale } from '@common/i18n/locale';
import { resolveRequestLocale } from '@common/i18n/locale';
import {
  renderMessage,
  renderNestedMessage,
  renderStoredMessages,
} from '@common/i18n/message-registry';
import { RouteNames } from '@common/route-names';
import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Request, Response } from 'express';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

/**
 * Step 1 of locale resolution: the caller's stored preference, embedded in the access token.
 * `undefined` only when unauthenticated; both it and `null` (never chose) fall through to `Accept-Language`.
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
    if (context.getType() === 'http') {
      const request = context.switchToHttp().getRequest<Request>();

      // Skip metrics, health and binary downloads that manage their own response via @Res().
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

      // The data export is the file itself, not an `ApiResponse`.
      const isDataExport = pathname === `/v1/${RouteNames.SETTINGS}/${RouteNames.SETTINGS_EXPORT}`;

      if (isMetricsOrHealth || isReceiptPdf || isDataExport) {
        // These bypass transformation; `CallHandler.handle()` is typed `Observable<any>`.
        // eslint-disable-next-line @typescript-eslint/no-unsafe-return
        return next.handle();
      }

      // Resolved once per request so `message` and HttpExceptionFilter's error response share a locale.
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
          // Check the key directly: `partial.data ?? data` would double-wrap an envelope whose own
          // `data` is legitimately null.
          const hasDataKey = Object.prototype.hasOwnProperty.call(partial, 'data');
          const resolvedData = renderStoredMessages(
            renderNestedMessage((hasDataKey ? partial.data : data) as T, locale),
            locale
          );

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

    // Other contexts pass through; `CallHandler.handle()` is typed `Observable<any>`.
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return next.handle();
  }
}
