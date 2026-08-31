import type { LoggerService } from '@logger/logger.service';
import type { CallHandler, ExecutionContext } from '@nestjs/common';
import { firstValueFrom, of } from 'rxjs';

import { HttpLoggingInterceptor } from './logging.interceptor';

describe('HttpLoggingInterceptor', () => {
  let interceptor: HttpLoggingInterceptor;
  let logger: jest.Mocked<Pick<LoggerService, 'http'>>;

  const buildContext = (
    requestOverrides: Record<string, unknown> = {},
    responseOverrides: Record<string, unknown> = {}
  ): ExecutionContext => {
    const request = {
      method: 'GET',
      url: '/things/1',
      httpVersion: '1.1',
      headers: {},
      query: {},
      body: {},
      ip: '127.0.0.1',
      socket: { remoteAddress: '127.0.0.1' },
      ...requestOverrides,
    };
    const response = {
      statusCode: 200,
      get: jest.fn().mockReturnValue('123'),
      ...responseOverrides,
    };

    return {
      switchToHttp: () => ({
        getRequest: () => request,
        getResponse: () => response,
      }),
      getHandler: jest.fn(),
      getClass: jest.fn(),
    } as unknown as ExecutionContext;
  };

  beforeEach(() => {
    logger = { http: jest.fn() };
    interceptor = new HttpLoggingInterceptor(logger as unknown as LoggerService);
  });

  it('logs the request/response shape with method, url, status and duration after the handler completes', async () => {
    const context = buildContext();
    const callHandler: CallHandler = { handle: () => of('response-body') };

    const result = await firstValueFrom(interceptor.intercept(context, callHandler));

    expect(result).toBe('response-body');
    expect(logger.http).toHaveBeenCalledTimes(1);
    const [message, tag] = logger.http.mock.calls[0] as [string, string];
    expect(tag).toBe('HTTP');
    expect(message).toContain('Method: GET');
    expect(message).toContain('URL: /things/1');
    expect(message).toContain('Status: 200');
    expect(message).toContain('Content-Length: 123');
  });

  it('falls back to "unknown" user-agent and "No Referer" when headers are absent', async () => {
    const context = buildContext({ headers: {} });
    const callHandler: CallHandler = { handle: () => of('ok') };

    await firstValueFrom(interceptor.intercept(context, callHandler));

    const [message] = logger.http.mock.calls[0] as [string, string];
    expect(message).toContain('User-Agent: unknown');
    expect(message).toContain('Referrer: No Referer');
  });

  it('normalizes a string referer header as-is', async () => {
    const context = buildContext({ headers: { referer: 'https://example.com' } });
    const callHandler: CallHandler = { handle: () => of('ok') };

    await firstValueFrom(interceptor.intercept(context, callHandler));

    const [message] = logger.http.mock.calls[0] as [string, string];
    expect(message).toContain('Referrer: https://example.com');
  });

  it('normalizes an array-valued referer header by joining with a comma', async () => {
    const context = buildContext({
      headers: { referer: ['https://a.example.com', 'https://b.example.com'] },
    });
    const callHandler: CallHandler = { handle: () => of('ok') };

    await firstValueFrom(interceptor.intercept(context, callHandler));

    const [message] = logger.http.mock.calls[0] as [string, string];
    expect(message).toContain('Referrer: https://a.example.com, https://b.example.com');
  });

  it('falls back to the "referrer" header when "referer" is not present', async () => {
    const context = buildContext({ headers: { referrer: 'https://fallback.example.com' } });
    const callHandler: CallHandler = { handle: () => of('ok') };

    await firstValueFrom(interceptor.intercept(context, callHandler));

    const [message] = logger.http.mock.calls[0] as [string, string];
    expect(message).toContain('Referrer: https://fallback.example.com');
  });

  it('falls back to socket.remoteAddress when request.ip is not set', async () => {
    const context = buildContext({ ip: undefined, socket: { remoteAddress: '10.0.0.5' } });
    const callHandler: CallHandler = { handle: () => of('ok') };

    await firstValueFrom(interceptor.intercept(context, callHandler));

    const [message] = logger.http.mock.calls[0] as [string, string];
    expect(message).toContain('Remote: 10.0.0.5');
  });

  it('falls back to "unknown" content-length when the response header is absent', async () => {
    const context = buildContext({}, { get: jest.fn().mockReturnValue(undefined) });
    const callHandler: CallHandler = { handle: () => of('ok') };

    await firstValueFrom(interceptor.intercept(context, callHandler));

    const [message] = logger.http.mock.calls[0] as [string, string];
    expect(message).toContain('Content-Length: unknown');
  });
});
