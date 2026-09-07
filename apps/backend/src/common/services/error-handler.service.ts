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

/**
 * Shape of an error from the `http-errors` package — what Express's body-parser throws for an
 * oversized body (`413`, `type: 'entity.too.large'`), malformed JSON (`400`), an unsupported
 * charset (`415`), etc. These are raised by middleware *before* Nest's pipeline, so they arrive
 * as plain Errors, not `HttpException`s; without recognising them every one surfaced as a 500.
 */
interface HttpClientError extends Error {
  statusCode: number;
  expose: boolean;
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

    if (this.isHttpClientError(error)) {
      return this.handleHttpClientError(error, context);
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

  /** Only 4xx with `expose: true` — that's `http-errors`' own contract for "safe to show the client"; a 5xx-shaped one still goes through the generic path and gets logged as unhandled. */
  private isHttpClientError(error: unknown): error is HttpClientError {
    if (!(error instanceof Error)) {
      return false;
    }
    const candidate = error as Partial<HttpClientError>;
    return (
      typeof candidate.statusCode === 'number' &&
      candidate.statusCode >= 400 &&
      candidate.statusCode < 500 &&
      candidate.expose === true
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
    return this.createErrorResponse(status, message, context, error, null, this.extractCode(error));
  }

  /**
   * An explicit machine-readable code from `new ConflictException({ message, code })`.
   *
   * Without it, `error` is derived from the status name alone, so two different 409s — say
   * CONNECTION_NEEDS_REAUTH (send the owner back through consent) and LOCATION_LIMIT_REACHED
   * (nothing to re-consent, the tenant already has a location) — are both just "Conflict", and the
   * only thing left to branch on is the human-readable message string. Purely additive: nothing
   * that throws a plain string message is affected.
   */
  private extractCode(error: HttpException): string | undefined {
    const response = error.getResponse();

    if (typeof response === 'object' && 'code' in response) {
      const code = (response as { code?: unknown }).code;
      return typeof code === 'string' ? code : undefined;
    }

    return undefined;
  }

  private handleHttpClientError(error: HttpClientError, context: string): ApiResponse<null> {
    this.logger.warn(`${error.name} in ${context}: ${error.message}`);
    return this.createErrorResponse(error.statusCode as HttpStatus, error.message, context, error);
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
    data?: T,
    code?: string
  ): ApiResponse<T | null> {
    return {
      statusCode,
      status: 'Failure',
      message,
      error: code ?? this.formatErrorString(HttpStatus[statusCode]),
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

  /**
   * A validation failure reaches the user verbatim (the web client shows any 4xx message as-is), so
   * each one is normalized into a sentence before the list is joined.
   *
   * Three things happen: a nested-DTO field prefix is dropped (`password.too short` → `too
   * short`), the first letter is capitalized, and terminal punctuation is added. Joining with a
   * space rather than a comma follows from that — comma-joining strings that already end in a
   * period reads as "…characters., Password must…".
   *
   * The prefix strip is skipped when it would empty the message, so a legitimately single-word
   * message like `Required.` survives.
   */
  private toSentence(message: string): string {
    const withoutPrefix = message.replace(/^[a-zA-Z0-9_.]+?\./, '');
    const trimmed = (withoutPrefix.trim() === '' ? message : withoutPrefix).trim();

    if (trimmed === '') {
      return trimmed;
    }

    const capitalized = trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
    return /[.!?]$/.test(capitalized) ? capitalized : `${capitalized}.`;
  }

  handleBadRequest(error: unknown, context: string): ApiResponse<unknown> {
    const responseError = this.asResponseCarryingError(error);
    const responseMessage = responseError?.response?.message;

    if (Array.isArray(responseMessage)) {
      return {
        statusCode: HttpStatus.BAD_REQUEST,
        status: 'Failure',
        message: responseMessage.map(msg => this.toSentence(msg)).join(' '),
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
