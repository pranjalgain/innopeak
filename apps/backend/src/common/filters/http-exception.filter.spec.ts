import { MESSAGES } from '@common/constants/messages.constants';
import { messagesDe } from '@common/i18n/messages.de';
import { messagesEn } from '@common/i18n/messages.en';
import { ErrorHandlerService } from '@common/services/error-handler.service';
import { LoggerService } from '@logger/logger.service';
import type { ArgumentsHost } from '@nestjs/common';
import {
  GoneException,
  InternalServerErrorException,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';

import { HttpExceptionFilter } from './http-exception.filter';

/**
 * Uses `ErrorHandlerService` for real (only its `LoggerService` mocked) to exercise the actual path
 * a `MESSAGES.X.Y`-keyed exception takes.
 */
describe('HttpExceptionFilter — locale-aware message rendering', () => {
  let filter: HttpExceptionFilter;

  function buildHost(headers: Record<string, string> = {}): {
    host: ArgumentsHost;
    response: { status: jest.Mock; json: jest.Mock; headersSent: boolean };
  } {
    const response = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn((body: unknown) => body),
      headersSent: false,
    };
    const request = { method: 'POST', url: '/v1/auth/login', headers };

    const host = {
      switchToHttp: () => ({
        getResponse: () => response,
        getRequest: () => request,
      }),
      getType: () => 'http',
    } as unknown as ArgumentsHost;

    return { host, response };
  }

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HttpExceptionFilter,
        ErrorHandlerService,
        {
          provide: LoggerService,
          useValue: { error: jest.fn(), warn: jest.fn(), log: jest.fn(), debug: jest.fn() },
        },
      ],
    }).compile();

    filter = module.get(HttpExceptionFilter);
  });

  it('renders a MESSAGES-derived exception message in German when Accept-Language asks for it', () => {
    const { host, response } = buildHost({ 'accept-language': 'de' });
    const exception = new UnauthorizedException(MESSAGES.AUTH.INVALID_CREDENTIALS);

    filter.catch(exception, host);

    const body = response.json.mock.calls[0]?.[0] as { message: string };
    expect(body.message).toBe(messagesDe.AUTH.INVALID_CREDENTIALS);
  });

  it('renders the same exception message in English by default (no Accept-Language)', () => {
    const { host, response } = buildHost();
    const exception = new UnauthorizedException(MESSAGES.AUTH.INVALID_CREDENTIALS);

    filter.catch(exception, host);

    const body = response.json.mock.calls[0]?.[0] as { message: string };
    expect(body.message).toBe(messagesEn.AUTH.INVALID_CREDENTIALS);
  });

  it('leaves a message that never went through MESSAGES unchanged, regardless of locale', () => {
    const { host, response } = buildHost({ 'accept-language': 'de' });
    // class-validator's pipeline throws a plain-string BadRequestException; it must pass through
    // untranslated and uncorrupted.
    const exception = new UnauthorizedException(
      'some ad-hoc message never passed through MESSAGES'
    );

    filter.catch(exception, host);

    const body = response.json.mock.calls[0]?.[0] as { message: string };
    expect(body.message).toBe('some ad-hoc message never passed through MESSAGES');
  });

  // Regression: every refused request (401, 410, 429) was an error line with a stack trace, burying real server faults.
  it.each([
    [new UnauthorizedException('nope'), 'warn'],
    [new GoneException('expired'), 'warn'],
    [new InternalServerErrorException('boom'), 'error'],
  ] as const)('logs %j at %s level, with a stack only for a server fault', (exception, level) => {
    const { host } = buildHost();
    jest.restoreAllMocks();
    const warn = jest.spyOn(Logger, 'warn').mockImplementation();
    const error = jest.spyOn(Logger, 'error').mockImplementation();

    filter.catch(exception, host);

    const logged = level === 'warn' ? warn : error;
    expect(logged).toHaveBeenCalledTimes(1);
    expect(String(logged.mock.calls[0]?.[0]).includes('Stack Trace')).toBe(level === 'error');
    expect(level === 'warn' ? error : warn).not.toHaveBeenCalled();
  });

  // The filter is `@Catch()`: it receives plain errors (a failed Stripe call, a driver error), not just HttpExceptions.
  it('answers a plain Error with a 500 envelope instead of throwing from the filter', () => {
    const { host, response } = buildHost();
    jest.spyOn(Logger, 'error').mockImplementation();

    expect(() => filter.catch(new Error('driver exploded') as never, host)).not.toThrow();

    expect(response.status).toHaveBeenCalledWith(500);
  });

  // Regression: a Stripe outage surfaced as an anonymous 500, so nothing told the client it was worth retrying.
  it('answers a transient Stripe failure with 503 PAYMENT_PROVIDER_UNAVAILABLE and logs the original', () => {
    const { host, response } = buildHost();
    const error = Object.assign(new Error('connect ETIMEDOUT api.stripe.com:443'), {
      type: 'StripeConnectionError',
    });
    const logged = jest.spyOn(Logger, 'error').mockImplementation();

    filter.catch(error as never, host);

    expect(response.status).toHaveBeenCalledWith(503);
    const body = response.json.mock.calls.at(-1)?.[0] as { error?: string; message: string };
    expect(JSON.stringify(body)).not.toContain('ETIMEDOUT');
    expect(String(logged.mock.calls.at(-1)?.[0])).toContain('ETIMEDOUT');
  });
});
