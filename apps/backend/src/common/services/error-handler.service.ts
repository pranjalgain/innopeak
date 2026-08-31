import { ApiResponse } from '@common/dto/api-response';
import { LoggerService } from '@logger/logger.service';
import { HttpException, HttpStatus, Injectable } from '@nestjs/common';

// PostgreSQL error codes: https://www.postgresql.org/docs/current/errcodes-appendix.html
const PG_ERROR_MAP: Record<string, { status: HttpStatus; message: string }> = {
  '23505': { status: HttpStatus.CONFLICT, message: 'Unique constraint violation' },
  '23503': { status: HttpStatus.BAD_REQUEST, message: 'Foreign key constraint failed' },
  '23502': { status: HttpStatus.BAD_REQUEST, message: 'Not null constraint violation' },
  '23514': { status: HttpStatus.BAD_REQUEST, message: 'Check constraint violation' },
  '23P01': { status: HttpStatus.BAD_REQUEST, message: 'Exclusion constraint violation' },
  '22001': { status: HttpStatus.BAD_REQUEST, message: 'Value too long for column type' },
  '22003': { status: HttpStatus.BAD_REQUEST, message: 'Numeric value out of range' },
  '22007': { status: HttpStatus.BAD_REQUEST, message: 'Invalid datetime format' },
  '22P02': { status: HttpStatus.BAD_REQUEST, message: 'Invalid text representation' },
  '42P01': { status: HttpStatus.INTERNAL_SERVER_ERROR, message: 'Table or view not found' },
  '42703': { status: HttpStatus.INTERNAL_SERVER_ERROR, message: 'Column not found' },
  '42601': { status: HttpStatus.INTERNAL_SERVER_ERROR, message: 'Syntax error in query' },
  '40001': {
    status: HttpStatus.CONFLICT,
    message: 'Serialization failure — retry the transaction',
  },
  '40P01': { status: HttpStatus.CONFLICT, message: 'Deadlock detected — retry the transaction' },
  '08006': { status: HttpStatus.SERVICE_UNAVAILABLE, message: 'Database connection failure' },
  '08001': {
    status: HttpStatus.SERVICE_UNAVAILABLE,
    message: 'Unable to establish database connection',
  },
  '57014': { status: HttpStatus.REQUEST_TIMEOUT, message: 'Query timeout — statement cancelled' },
};

/** Duck-typed shape of an error thrown by the `pg` driver (it doesn't export a typed error class). */
interface PostgresError extends Error {
  code: string;
  severity: string;
  detail?: string;
  table?: string;
  column?: string;
}

/**
 * Shape shared by axios-style HTTP client errors and Passport social-auth
 * strategy errors — both carry an optional `response` payload from the
 * upstream service.
 */
interface ResponseCarryingError extends Error {
  response?: {
    status?: number;
    data?: unknown;
    message?: string[] | string;
  };
}

@Injectable()
export class ErrorHandlerService {
  constructor(private readonly logger: LoggerService) {}

  handleError(error: unknown, context: string): ApiResponse<null> {
    if (this.isPostgresError(error)) {
      return this.handlePgError(error, context);
    }

    if (error instanceof HttpException) {
      return this.handleHttpException(error, context);
    }

    if (this.isSocialAuthError(error)) {
      return this.handleSocialAuthError(error, context);
    }

    return this.handleUnhandledError(error, context);
  }

  private isPostgresError(error: unknown): error is PostgresError {
    if (!(error instanceof Error)) {
      return false;
    }
    const candidate = error as PostgresError;
    return (
      typeof candidate.code === 'string' &&
      candidate.code.length === 5 &&
      Boolean(candidate.severity)
    );
  }

  private isSocialAuthError(error: unknown): error is ResponseCarryingError {
    return error instanceof Error && error.name === 'SocialAuthError';
  }

  private asResponseCarryingError(error: unknown): ResponseCarryingError | undefined {
    return error instanceof Error ? (error as ResponseCarryingError) : undefined;
  }

  private extractMessage(error: unknown): string | undefined {
    if (error instanceof Error) {
      return error.message;
    }
    return typeof error === 'string' ? error : undefined;
  }

  private extractStack(error: unknown): string | undefined {
    return error instanceof Error ? error.stack : undefined;
  }

  private handlePgError(error: PostgresError, context: string): ApiResponse<null> {
    const mapped = PG_ERROR_MAP[error.code];

    if (mapped) {
      const detail = error.detail ? ` ${error.detail}` : '';
      const table = error.table ? ` (table: ${error.table})` : '';
      const column = error.column ? ` (column: ${error.column})` : '';
      const message = `${mapped.message}${table}${column}.${detail}`;
      return this.createErrorResponse(mapped.status, message, context, error);
    }

    const message = error.detail ?? error.message;
    return this.createErrorResponse(HttpStatus.INTERNAL_SERVER_ERROR, message, context, error);
  }

  private handleHttpException(error: HttpException, context: string): ApiResponse<null> {
    const status = error.getStatus();
    const message = error.message;
    this.logger.warn(`${error.name} in ${context}: ${message}`, error.stack);
    return this.createErrorResponse(status, message, context, error);
  }

  private handleSocialAuthError(error: ResponseCarryingError, context: string): ApiResponse<null> {
    if (error.response) {
      this.logger.error(
        `Social auth API error in ${context}: ${JSON.stringify(error.response.data)}`,
        error.stack
      );
      return this.createErrorResponse(HttpStatus.BAD_REQUEST, error.message, context, error);
    }
    this.logger.error(`Unhandled social auth error in ${context}: ${error.message}`, error.stack);
    return this.createErrorResponse(
      HttpStatus.INTERNAL_SERVER_ERROR,
      error.message,
      context,
      error
    );
  }

  private handleUnhandledError(error: unknown, context: string): ApiResponse<null> {
    const message = this.extractMessage(error);
    this.logger.error(
      `Unhandled error in ${context}: ${message ?? 'Unknown error'}`,
      this.extractStack(error)
    );
    if (message?.includes('Failed to send SMS')) {
      return this.createErrorResponse(
        HttpStatus.FORBIDDEN,
        'SMS service is restricted for trial accounts. Please verify the recipient number or upgrade your Twilio account.',
        context,
        error
      );
    }
    return this.createErrorResponse(
      HttpStatus.INTERNAL_SERVER_ERROR,
      message ?? 'An unknown error occurred. Please try again later.',
      context,
      error
    );
  }

  private createErrorResponse<T = null>(
    statusCode: HttpStatus,
    message: string,
    _context: string,
    _error: unknown,
    data?: T
  ): ApiResponse<T | null> {
    return {
      statusCode,
      status: 'Failure',
      message,
      error: this.formatErrorString(HttpStatus[statusCode]),
      data: data ?? null,
    };
  }

  private formatErrorString(error: string): string {
    return error
      .split('_')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');
  }

  handleAuthError(error: unknown, context: string): ApiResponse<null> {
    const responseError = this.asResponseCarryingError(error);
    const message = this.extractMessage(error);

    if (responseError?.response?.status === 401) {
      return this.createErrorResponse(
        HttpStatus.UNAUTHORIZED,
        message ?? 'Unauthorized access.',
        context,
        error
      );
    }
    if (responseError?.response?.status === 403) {
      return this.createErrorResponse(
        HttpStatus.FORBIDDEN,
        message ?? 'Access denied.',
        context,
        error
      );
    }
    return this.createErrorResponse(
      HttpStatus.INTERNAL_SERVER_ERROR,
      message ?? 'An unknown authentication error occurred.',
      context,
      error
    );
  }

  handleBadRequest(error: unknown, context: string): ApiResponse<unknown> {
    const responseError = this.asResponseCarryingError(error);
    const responseMessage = responseError?.response?.message;

    if (Array.isArray(responseMessage)) {
      const cleanedMessages = responseMessage.map(msg => msg.replace(/^[a-zA-Z0-9_.]+?\./, ''));
      return {
        statusCode: HttpStatus.BAD_REQUEST,
        status: 'Failure',
        message: cleanedMessages.join(', '),
        error: 'Validation Error',
      };
    }

    const message = this.extractMessage(error) ?? responseMessage ?? 'Bad request.';

    return this.createErrorResponse(
      HttpStatus.BAD_REQUEST,
      message,
      context,
      error,
      responseError?.response?.data ?? null
    );
  }

  handleUnauthorized(error: unknown, context: string): ApiResponse<null> {
    return this.createErrorResponse(
      HttpStatus.UNAUTHORIZED,
      this.extractMessage(error) ?? 'Unauthorized.',
      context,
      error
    );
  }

  handleForbidden(error: unknown, context: string): ApiResponse<null> {
    const message = this.extractMessage(error);
    if (message?.includes('authorization grant is invalid')) {
      return this.createErrorResponse(
        HttpStatus.FORBIDDEN,
        'Email service is temporarily unavailable. We are working on a fix.',
        context,
        error
      );
    }
    return this.createErrorResponse(HttpStatus.FORBIDDEN, message ?? 'Forbidden.', context, error);
  }

  handleNotFound(error: unknown, context: string): ApiResponse<null> {
    return this.createErrorResponse(
      HttpStatus.NOT_FOUND,
      this.extractMessage(error) ?? 'Not found.',
      context,
      error
    );
  }

  handleInternalServerError(error: unknown, context: string): ApiResponse<null> {
    return this.createErrorResponse(
      HttpStatus.INTERNAL_SERVER_ERROR,
      this.extractMessage(error) ?? 'Internal server error.',
      context,
      error
    );
  }
}
