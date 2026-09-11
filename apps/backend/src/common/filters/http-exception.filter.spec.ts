import { MESSAGES } from '@common/constants/messages.constants';
import { messagesDe } from '@common/i18n/messages.de';
import { messagesEn } from '@common/i18n/messages.en';
import { ErrorHandlerService } from '@common/services/error-handler.service';
import { LoggerService } from '@logger/logger.service';
import type { ArgumentsHost } from '@nestjs/common';
import { UnauthorizedException } from '@nestjs/common';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';

import { HttpExceptionFilter } from './http-exception.filter';

/**
 * The error-response edge of the "translate at the edge" mechanism. `ErrorHandlerService` is
 * used for real here (with only its `LoggerService` dependency mocked) rather than stubbed out,
 * so this exercises the actual path a thrown `MESSAGES.X.Y`-keyed exception takes: construct →
 * `ErrorHandlerService` builds the response body, still carrying the tag → the filter resolves
 * the request's locale and renders it right before the response is sent.
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
    // BadRequestException with a plain string is what class-validator's own pipeline produces —
    // this mechanism does not (yet) translate that, and must not corrupt it either.
    const exception = new UnauthorizedException(
      'some ad-hoc message never passed through MESSAGES'
    );

    filter.catch(exception, host);

    const body = response.json.mock.calls[0]?.[0] as { message: string };
    expect(body.message).toBe('some ad-hoc message never passed through MESSAGES');
  });
});
