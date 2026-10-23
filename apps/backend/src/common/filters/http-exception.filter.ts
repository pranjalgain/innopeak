import { ApiResponse } from '@common/dto/api-response';
import { CustomUnauthorizedException } from '@common/filters/exception/custom-unauthorized-exception';
import { mapProviderFailure } from '@common/filters/exception/provider-failure.mapper';
import { toLoggableError } from '@common/helpers/loggable-error.util';
import { safeUrl } from '@common/helpers/safe-url.util';
import { resolveRequestLocale } from '@common/i18n/locale';
import { renderMessage, renderNestedMessage } from '@common/i18n/message-registry';
import { ErrorHandlerService } from '@common/services/error-handler.service';
import { requestUserLocale } from '@interceptors/transform.interceptor';
import {
  ArgumentsHost,
  BadRequestException,
  Catch,
  ExceptionFilter,
  ForbiddenException,
  HttpException,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';

/**
 * The status of something that is not a Nest `HttpException`: a body-parser or `http-errors` rejection (malformed JSON, a body over the limit)
 * carries its own 4xx status and is marked `expose`. It is the caller's mistake and answers 4xx (`ErrorHandlerService` does), so it is logged as
 * the warning it is, not as a 500 with a stack. Anything else is a server fault.
 */
function clientErrorStatus(error: unknown): number {
  const candidate = error as { statusCode?: unknown; status?: unknown; expose?: unknown } | null;
  const status = candidate?.statusCode ?? candidate?.status;
  return candidate?.expose === true && typeof status === 'number' && status >= 400 && status < 500
    ? status
    : 500;
}

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  constructor(private readonly errorHandlerService: ErrorHandlerService) {}

  catch(thrown: HttpException, host: ArgumentsHost): ApiResponse<unknown> | Response {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    // The path only: the raw URL carries invite tokens and OAuth `code`/`state`, which must not reach the error log either.
    const context = `${request.method} ${safeUrl(request.url)}`;
    const errorId = uuidv4();
    // Resolved once for the log line (always English, what ops reads) and the response (caller's
    // locale). With no stored-user locale (thrown before `JwtAuthGuard`, or a `@Public()` route) it
    // falls through to `Accept-Language`.
    const locale = resolveRequestLocale(
      requestUserLocale(request),
      request.headers['accept-language']
    );

    // A transient provider failure (Stripe down, rate limited) is answered as 503 so clients know to retry; the original is what gets logged.
    const exception = mapProviderFailure(thrown) as HttpException;

    // The stack only helps with a server fault; a 4xx is the caller's request being refused (often an expected
    // answer, like an expired choice or a lapsed token), so it is one warning line.
    // A failed database statement is logged without its SQL and bound values (password hashes, emails, review text).
    const loggable = toLoggableError(thrown);
    const logLine = `[ErrorID: ${errorId}] Message: ${renderMessage(loggable.message, 'en')}`;
    // `@Catch()` receives anything thrown, not only HttpExceptions: a plain Error has no `getStatus`, and is a server fault.
    const status =
      exception instanceof HttpException ? exception.getStatus() : clientErrorStatus(thrown);
    if (status >= 500) {
      Logger.error(`${logLine}\nStack Trace: ${loggable.stack}`, 'ErrorContext');
    } else {
      Logger.warn(logLine, 'ErrorContext');
    }

    let errorResponse: ApiResponse<unknown>;

    try {
      if (exception instanceof CustomUnauthorizedException) {
        errorResponse = this.errorHandlerService.handleUnauthorized(exception, context);
      } else if (exception instanceof ForbiddenException) {
        errorResponse = this.errorHandlerService.handleForbidden(exception, context);
      } else if (exception instanceof BadRequestException) {
        errorResponse = this.errorHandlerService.handleBadRequest(exception, context, locale);
      } else {
        errorResponse = this.errorHandlerService.handleError(exception, context);
      }
    } catch (parseError) {
      Logger.error(
        `[ErrorID: ${errorId}] Failed to construct error response: ${(parseError as Error).message}`
      );
      errorResponse = {
        statusCode: 500,
        status: 'Failure',
        message: 'Internal Server Error',
        error: 'Unexpected error occurred',
        data: null,
      };
    }

    errorResponse.traceId = errorId;
    if (errorResponse.message !== undefined) {
      errorResponse.message = renderMessage(errorResponse.message, locale);
    }
    // Same data.message duplication `TransformInterceptor` guards against on the success path, in
    // case an error's `data` nests one.
    errorResponse.data = renderNestedMessage(errorResponse.data, locale);

    if (host.getType() === 'http') {
      if (!response.headersSent) {
        return response.status(errorResponse.statusCode ?? 500).json(errorResponse);
      } else {
        Logger.warn(
          `[ErrorID: ${errorId}] Attempted to send response after headers were already sent for ${context}`
        );
      }
    }

    return errorResponse;
  }
}
