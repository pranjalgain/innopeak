import { ApiResponse } from '@common/dto/api-response';
import { CustomUnauthorizedException } from '@common/filters/exception/custom-unauthorized-exception';
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

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  constructor(private readonly errorHandlerService: ErrorHandlerService) {}

  catch(exception: HttpException, host: ArgumentsHost): ApiResponse<unknown> | Response {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const context = `${request.method} ${request.url}`;
    const errorId = uuidv4();
    // Resolved once, reused for both the log line below (rendered in English regardless — see
    // the `renderMessage(exception.message, 'en')` call) and the client-facing response — the
    // log always reads in the language ops works in; the response reads in the caller's own.
    // An exception thrown before `JwtAuthGuard` populates `request.user` (or on a `@Public()`
    // route) has no stored-user locale to read, and correctly falls through to `Accept-Language`.
    const locale = resolveRequestLocale(
      requestUserLocale(request),
      request.headers['accept-language']
    );

    Logger.error(
      `[ErrorID: ${errorId}] Message: ${renderMessage(exception.message, 'en')}\nStack Trace: ${exception.stack}`,
      'ErrorContext'
    );

    let errorResponse: ApiResponse<unknown>;

    try {
      if (exception instanceof CustomUnauthorizedException) {
        errorResponse = this.errorHandlerService.handleUnauthorized(exception, context);
      } else if (exception instanceof ForbiddenException) {
        errorResponse = this.errorHandlerService.handleForbidden(exception, context);
      } else if (exception instanceof BadRequestException) {
        errorResponse = this.errorHandlerService.handleBadRequest(exception, context);
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
    // See `renderNestedMessage` — the same data.message duplication `TransformInterceptor`
    // guards against on the success path, applied here in case an error's `data` (rare — most
    // error responses carry `data: null`) ever nests one too.
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
