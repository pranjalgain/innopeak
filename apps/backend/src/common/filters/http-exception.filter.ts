import { ApiResponse } from '@common/dto/api-response';
import { CustomUnauthorizedException } from '@common/filters/exception/custom-unauthorized-exception';
import { ErrorHandlerService } from '@common/services/error-handler.service';
import {
  ArgumentsHost,
  BadRequestException,
  Catch,
  ExceptionFilter,
  ForbiddenException,
  HttpException,
  Logger,
} from '@nestjs/common';
import { Response } from 'express';
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

    Logger.error(
      `[ErrorID: ${errorId}] Message: ${exception.message}\nStack Trace: ${exception.stack}`,
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
