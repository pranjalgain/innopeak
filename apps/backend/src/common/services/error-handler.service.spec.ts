import { MESSAGES } from '@common/constants/messages.constants';
import { renderMessage } from '@common/i18n/message-registry';
import { LoggerService } from '@logger/logger.service';
import { BadRequestException, HttpException, HttpStatus } from '@nestjs/common';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';

import { ErrorHandlerService } from './error-handler.service';

interface PostgresErrorLike extends Error {
  code: string;
  severity: string;
  detail?: string;
  table?: string;
  column?: string;
}

function makePgError(overrides: Partial<PostgresErrorLike> = {}): PostgresErrorLike {
  const error = new Error(overrides.message ?? 'pg failure') as PostgresErrorLike;
  error.code = overrides.code ?? '23505';
  error.severity = overrides.severity ?? 'ERROR';
  if (overrides.detail !== undefined) error.detail = overrides.detail;
  if (overrides.table !== undefined) error.table = overrides.table;
  if (overrides.column !== undefined) error.column = overrides.column;
  return error;
}

interface ResponseCarryingErrorLike extends Error {
  response?: { status?: number; data?: unknown; message?: string[] | string };
}

function makeSocialAuthError(response?: ResponseCarryingErrorLike['response']): Error {
  const error = new Error('social auth failed') as ResponseCarryingErrorLike;
  error.name = 'SocialAuthError';
  if (response !== undefined) error.response = response;
  return error;
}

describe('ErrorHandlerService', () => {
  let target: ErrorHandlerService;
  let logger: jest.Mocked<LoggerService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ErrorHandlerService,
        {
          provide: LoggerService,
          useValue: { error: jest.fn(), warn: jest.fn(), log: jest.fn(), debug: jest.fn() },
        },
      ],
    }).compile();
    target = module.get(ErrorHandlerService);
    logger = module.get(LoggerService);
  });

  afterEach(() => jest.clearAllMocks());

  describe('handleError', () => {
    it('routes Postgres-shaped errors to the Postgres handler', () => {
      const error = makePgError({ code: '23505', table: 'users', detail: 'Key already exists.' });

      const result = target.handleError(error, 'UsersService.create');

      expect(result.statusCode).toBe(HttpStatus.CONFLICT);
      expect(result.message).toContain('Unique constraint violation');
      expect(result.message).toContain('(table: users)');
      expect(result.error).toBe('Conflict');
    });

    it('routes HttpException instances to the HttpException handler', () => {
      const error = new HttpException('Not allowed', HttpStatus.FORBIDDEN);

      const result = target.handleError(error, 'UsersService.remove');

      expect(result.statusCode).toBe(HttpStatus.FORBIDDEN);
      expect(result.message).toBe('Not allowed');
      expect(logger.warn).toHaveBeenCalled();
    });

    it('routes SocialAuthError instances to the social auth handler', () => {
      const error = makeSocialAuthError({ status: 400, data: { reason: 'bad token' } });

      const result = target.handleError(error, 'AuthService.google');

      expect(result.statusCode).toBe(HttpStatus.BAD_REQUEST);
      expect(result.message).toBe('social auth failed');
      expect(logger.error).toHaveBeenCalled();
    });

    it('falls back to the unhandled error handler for plain errors', () => {
      const error = new Error('boom');

      const result = target.handleError(error, 'SomeService.method');

      expect(result.statusCode).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
      expect(result.message).toBe('boom');
    });
  });

  describe('Postgres error mapping (via handleError)', () => {
    it('maps a mapped error code to its configured status and message', () => {
      const error = makePgError({ code: '23503', column: 'user_id' });

      const result = target.handleError(error, 'ctx');

      expect(result.statusCode).toBe(HttpStatus.BAD_REQUEST);
      expect(result.message).toContain('Foreign key constraint failed');
      expect(result.message).toContain('(column: user_id)');
    });

    it('falls back to INTERNAL_SERVER_ERROR for an unmapped Postgres error code', () => {
      const error = makePgError({ code: '99999', detail: 'weird detail' });

      const result = target.handleError(error, 'ctx');

      expect(result.statusCode).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
      expect(result.message).toBe('weird detail');
    });

    it('uses the error message when no detail is present for an unmapped code', () => {
      const error = makePgError({ code: '99999' });

      const result = target.handleError(error, 'ctx');

      expect(result.message).toBe('pg failure');
    });

    describe('in production', () => {
      const originalNodeEnv = process.env['NODE_ENV'];

      beforeEach(() => {
        process.env['NODE_ENV'] = 'production';
      });

      afterEach(() => {
        if (originalNodeEnv === undefined) {
          delete process.env['NODE_ENV'];
        } else {
          process.env['NODE_ENV'] = originalNodeEnv;
        }
      });

      it('drops table/column/detail from a mapped error but keeps the generic classification', () => {
        const error = makePgError({
          code: '23505',
          table: 'users',
          column: 'email',
          detail: 'Key (email)=(jane@example.com) already exists.',
        });

        const result = target.handleError(error, 'ctx');

        expect(result.statusCode).toBe(HttpStatus.CONFLICT);
        expect(result.message).toBe('Unique constraint violation');
        expect(result.message).not.toContain('users');
        expect(result.message).not.toContain('email');
        expect(result.message).not.toContain('jane@example.com');
      });

      it('redacts an unmapped code to a generic, catalog-backed fallback', () => {
        const error = makePgError({ code: '99999', detail: 'weird detail' });

        const result = target.handleError(error, 'ctx');

        expect(result.statusCode).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
        expect(result.message).toBe(MESSAGES.COMMON.INTERNAL_ERROR);
        expect(result.message).not.toContain('weird detail');
      });
    });
  });

  describe('social auth error mapping (via handleError)', () => {
    it('returns INTERNAL_SERVER_ERROR when there is no response payload', () => {
      const error = makeSocialAuthError(undefined);

      const result = target.handleError(error, 'ctx');

      expect(result.statusCode).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
      expect(result.message).toBe('social auth failed');
      expect(logger.error).toHaveBeenCalled();
    });

    describe('in production', () => {
      const originalNodeEnv = process.env['NODE_ENV'];

      beforeEach(() => {
        process.env['NODE_ENV'] = 'production';
      });

      afterEach(() => {
        if (originalNodeEnv === undefined) {
          delete process.env['NODE_ENV'];
        } else {
          process.env['NODE_ENV'] = originalNodeEnv;
        }
      });

      it('redacts the client-facing message when an upstream response payload is present', () => {
        const error = makeSocialAuthError({ status: 400, data: { reason: 'bad token' } });

        const result = target.handleError(error, 'ctx');

        expect(result.statusCode).toBe(HttpStatus.BAD_REQUEST);
        expect(result.message).toBe(MESSAGES.COMMON.INTERNAL_ERROR);
        expect(logger.error).toHaveBeenCalledWith(
          expect.stringContaining('bad token'),
          expect.anything()
        );
      });

      it('redacts the client-facing message when there is no response payload', () => {
        const error = makeSocialAuthError(undefined);

        const result = target.handleError(error, 'ctx');

        expect(result.statusCode).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
        expect(result.message).toBe(MESSAGES.COMMON.INTERNAL_ERROR);
        expect(result.message).not.toBe('social auth failed');
      });
    });
  });

  describe('handleUnhandledError (via handleError)', () => {
    it('maps SMS-provider failures to FORBIDDEN with a friendly message', () => {
      const error = new Error('Failed to send SMS: trial account restriction');

      const result = target.handleError(error, 'SmsService.send');

      expect(result.statusCode).toBe(HttpStatus.FORBIDDEN);
      expect(result.message).toContain('SMS service is restricted for trial accounts');
    });

    it('handles non-Error unknown values with a generic message', () => {
      const result = target.handleError({ some: 'object' }, 'ctx');

      expect(result.statusCode).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
      expect(result.message).toBe('An unknown error occurred. Please try again later.');
    });

    it('handles thrown string values', () => {
      const result = target.handleError('a string error', 'ctx');

      expect(result.statusCode).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
      expect(result.message).toBe('a string error');
    });

    /**
     * `MESSAGES.SETTINGS.TENANT_SETTINGS_ROW_MISSING` stands in for any DB Service/Repository
     * should-never-happen guard that now throws through the message catalog — a tagged key, not
     * literal English. This must never leak into the log unrendered.
     */
    it('renders a tagged MESSAGES key into English before logging it', () => {
      const error = new Error(MESSAGES.SETTINGS.TENANT_SETTINGS_ROW_MISSING('tenant-1'));

      target.handleError(error, 'ReviewPipelineDbService.loadClassificationContext');

      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining(
          renderMessage(MESSAGES.SETTINGS.TENANT_SETTINGS_ROW_MISSING('tenant-1'), 'en')
        ),
        expect.anything()
      );
    });

    describe('in production', () => {
      const originalNodeEnv = process.env['NODE_ENV'];

      beforeEach(() => {
        process.env['NODE_ENV'] = 'production';
      });

      afterEach(() => {
        if (originalNodeEnv === undefined) {
          delete process.env['NODE_ENV'];
        } else {
          process.env['NODE_ENV'] = originalNodeEnv;
        }
      });

      it('redacts the client-facing message to a generic, catalog-backed fallback', () => {
        const error = new Error(MESSAGES.SETTINGS.TENANT_SETTINGS_ROW_MISSING('tenant-1'));

        const result = target.handleError(error, 'ctx');

        expect(result.statusCode).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
        expect(result.message).toBe(MESSAGES.COMMON.INTERNAL_ERROR);
        expect(result.message).not.toContain('tenant-1');
      });

      it('still logs the full raw message and stack server-side', () => {
        const error = new Error(MESSAGES.SETTINGS.TENANT_SETTINGS_ROW_MISSING('tenant-1'));

        target.handleError(error, 'ctx');

        expect(logger.error).toHaveBeenCalledWith(
          expect.stringContaining(
            renderMessage(MESSAGES.SETTINGS.TENANT_SETTINGS_ROW_MISSING('tenant-1'), 'en')
          ),
          expect.anything()
        );
      });

      it('does not redact the SMS-provider friendly-message branch', () => {
        const error = new Error('Failed to send SMS: trial account restriction');

        const result = target.handleError(error, 'SmsService.send');

        expect(result.statusCode).toBe(HttpStatus.FORBIDDEN);
        expect(result.message).toContain('SMS service is restricted for trial accounts');
      });
    });
  });

  describe('handleAuthError', () => {
    it('maps a 401 upstream response to UNAUTHORIZED', () => {
      const error = Object.assign(new Error('token expired'), { response: { status: 401 } });

      const result = target.handleAuthError(error, 'ctx');

      expect(result.statusCode).toBe(HttpStatus.UNAUTHORIZED);
      expect(result.message).toBe('token expired');
    });

    it('maps a 403 upstream response to FORBIDDEN', () => {
      const error = Object.assign(new Error('no access'), { response: { status: 403 } });

      const result = target.handleAuthError(error, 'ctx');

      expect(result.statusCode).toBe(HttpStatus.FORBIDDEN);
      expect(result.message).toBe('no access');
    });

    it('defaults to INTERNAL_SERVER_ERROR for unrecognized auth failures', () => {
      const error = new Error('mystery failure');

      const result = target.handleAuthError(error, 'ctx');

      expect(result.statusCode).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
      expect(result.message).toBe('mystery failure');
    });

    it('uses a default message when no message can be extracted from the error', () => {
      const result = target.handleAuthError({ some: 'object' }, 'ctx');

      expect(result.statusCode).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
      expect(result.message).toBe('An unknown authentication error occurred.');
    });
  });

  describe('handleBadRequest', () => {
    it('strips the field prefix and renders each validation message as a sentence', () => {
      const error = Object.assign(new Error('validation failed'), {
        response: { message: ['email.must be an email', 'password.too short'] },
      });

      const result = target.handleBadRequest(error, 'ctx');

      expect(result.statusCode).toBe(HttpStatus.BAD_REQUEST);
      expect(result.message).toBe('Must be an email. Too short.');
      expect(result.error).toBe('Validation Error');
    });

    it('leaves an already-formatted message alone rather than double-punctuating it', () => {
      const error = Object.assign(new Error('validation failed'), {
        response: {
          message: [
            'Password must be between 8 and 128 characters.',
            'Enter a valid email address.',
          ],
        },
      });

      const result = target.handleBadRequest(error, 'ctx');

      expect(result.message).toBe(
        'Password must be between 8 and 128 characters. Enter a valid email address.'
      );
    });

    it('keeps a single-word message that the field-prefix strip would otherwise empty', () => {
      const error = Object.assign(new Error('validation failed'), {
        response: { message: ['Required.'] },
      });

      expect(target.handleBadRequest(error, 'ctx').message).toBe('Required.');
    });

    it('falls back to a generic bad request message when no array is present', () => {
      const result = target.handleBadRequest({}, 'ctx');

      expect(result.statusCode).toBe(HttpStatus.BAD_REQUEST);
      expect(result.message).toBe('Bad request.');
    });

    it('uses the error message when available instead of the generic fallback', () => {
      const error = new Error('invalid payload');

      const result = target.handleBadRequest(error, 'ctx');

      expect(result.message).toBe('invalid payload');
    });

    /**
     * Regression: `handleHttpException` (the non-BadRequestException path) already read a
     * `{ message, code }`-shaped exception's `code` via `extractCode`, but this path never did —
     * so a `new BadRequestException({ message, code: 'X' })` silently lost `code`, surfacing as
     * a plain "Bad Request" the frontend could never branch on.
     */
    it('surfaces a machine-readable code from a BadRequestException({ message, code }) payload', () => {
      const error = new BadRequestException({
        message: 'Missing required prompt placeholder(s): review_text',
        code: 'MISSING_PLACEHOLDER',
      });

      const result = target.handleBadRequest(error, 'ctx');

      expect(result.message).toBe('Missing required prompt placeholder(s): review_text');
      expect(result.error).toBe('MISSING_PLACEHOLDER');
    });

    it('still falls back to the generic "Bad Request" error string for a plain-string BadRequestException', () => {
      const error = new BadRequestException('invalid payload');

      const result = target.handleBadRequest(error, 'ctx');

      expect(result.error).toBe('Bad Request');
    });
  });

  describe('handleUnauthorized', () => {
    it('returns a 401 response with the extracted message', () => {
      const result = target.handleUnauthorized(new Error('nope'), 'ctx');

      expect(result.statusCode).toBe(HttpStatus.UNAUTHORIZED);
      expect(result.message).toBe('nope');
    });

    it('uses a default message when none can be extracted', () => {
      const result = target.handleUnauthorized({}, 'ctx');

      expect(result.message).toBe('Unauthorized.');
    });
  });

  describe('handleForbidden', () => {
    it('maps invalid OAuth grant errors to a friendly email-service message', () => {
      const error = new Error('the authorization grant is invalid or expired');

      const result = target.handleForbidden(error, 'ctx');

      expect(result.statusCode).toBe(HttpStatus.FORBIDDEN);
      expect(result.message).toBe(
        'Email service is temporarily unavailable. We are working on a fix.'
      );
    });

    it('returns the raw message for other forbidden errors', () => {
      const result = target.handleForbidden(new Error('blocked'), 'ctx');

      expect(result.statusCode).toBe(HttpStatus.FORBIDDEN);
      expect(result.message).toBe('blocked');
    });

    it('uses a default message when none can be extracted', () => {
      const result = target.handleForbidden({}, 'ctx');

      expect(result.message).toBe('Forbidden.');
    });
  });

  describe('handleNotFound', () => {
    it('returns a 404 response with the extracted message', () => {
      const result = target.handleNotFound(new Error('missing resource'), 'ctx');

      expect(result.statusCode).toBe(HttpStatus.NOT_FOUND);
      expect(result.message).toBe('missing resource');
    });

    it('uses a default message when none can be extracted', () => {
      const result = target.handleNotFound({}, 'ctx');

      expect(result.message).toBe('Not found.');
    });
  });

  describe('handleInternalServerError', () => {
    it('returns a 500 response with the extracted message', () => {
      const result = target.handleInternalServerError(new Error('kaboom'), 'ctx');

      expect(result.statusCode).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
      expect(result.message).toBe('kaboom');
      expect(result.error).toBe('Internal Server Error');
    });

    it('uses a default message when none can be extracted', () => {
      const result = target.handleInternalServerError({}, 'ctx');

      expect(result.message).toBe('Internal server error.');
    });
  });
});
