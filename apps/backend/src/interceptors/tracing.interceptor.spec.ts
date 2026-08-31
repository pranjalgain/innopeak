import type { CallHandler, ExecutionContext } from '@nestjs/common';
import { SpanStatusCode, trace } from '@opentelemetry/api';
import { firstValueFrom, of, throwError } from 'rxjs';

import { TracingInterceptor } from './tracing.interceptor';

jest.mock('@opentelemetry/api', () => ({
  trace: { getTracer: jest.fn() },
  SpanStatusCode: { OK: 1, ERROR: 2 },
}));

describe('TracingInterceptor', () => {
  let interceptor: TracingInterceptor;
  let span: { setAttributes: jest.Mock; setStatus: jest.Mock; end: jest.Mock };
  let tracer: { startSpan: jest.Mock };

  const buildContext = (requestOverrides: Record<string, unknown> = {}): ExecutionContext => {
    const request = {
      method: 'GET',
      url: '/things/1',
      headers: {},
      get: jest.fn().mockReturnValue('jest-agent'),
      ...requestOverrides,
    };
    const response = { statusCode: 200 };

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
    const configService = { get: jest.fn().mockReturnValue(undefined) };
    interceptor = new TracingInterceptor(configService as never);
    span = { setAttributes: jest.fn(), setStatus: jest.fn(), end: jest.fn() };
    tracer = { startSpan: jest.fn().mockReturnValue(span) };
    (trace.getTracer as jest.Mock).mockReturnValue(tracer);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('starts a span named "METHOD url" with base http/service attributes', async () => {
    const context = buildContext();
    const callHandler: CallHandler = { handle: () => of({ hello: 'world' }) };

    const result = await firstValueFrom(interceptor.intercept(context, callHandler));

    expect(result).toEqual({ hello: 'world' });
    expect(tracer.startSpan).toHaveBeenCalledWith(
      'GET /things/1',
      expect.objectContaining({
        attributes: expect.objectContaining({
          'http.method': 'GET',
          'http.url': '/things/1',
          'http.user_agent': 'jest-agent',
          'service.name': 'nestjs-app',
        }),
      })
    );
  });

  it('adds the x-request-id header as a span attribute when present', async () => {
    const context = buildContext({ headers: { 'x-request-id': 'req-1' } });
    const callHandler: CallHandler = { handle: () => of('ok') };

    await firstValueFrom(interceptor.intercept(context, callHandler));

    expect(span.setAttributes).toHaveBeenCalledWith({ 'http.request_id': 'req-1' });
  });

  it('on success, records status code, duration, response size and marks span OK', async () => {
    const context = buildContext();
    const callHandler: CallHandler = { handle: () => of({ a: 1 }) };

    await firstValueFrom(interceptor.intercept(context, callHandler));

    expect(span.setAttributes).toHaveBeenCalledWith(
      expect.objectContaining({
        'http.status_code': 200,
        'response.size': JSON.stringify({ a: 1 }).length,
      })
    );
    expect(span.setStatus).toHaveBeenCalledWith({ code: SpanStatusCode.OK });
    expect(span.end).toHaveBeenCalledTimes(1);
  });

  it('computes response size via JSON.stringify for a plain string (quotes included)', async () => {
    const context = buildContext();
    const callHandler: CallHandler = { handle: () => of('plain-text') };

    await firstValueFrom(interceptor.intercept(context, callHandler));

    // For strings, JSON.stringify succeeds (adding surrounding quotes), so the
    // `typeof data === 'string'` branch inside the catch is only reached when
    // JSON.stringify itself throws — which a plain string never does.
    expect(span.setAttributes).toHaveBeenCalledWith(
      expect.objectContaining({ 'response.size': JSON.stringify('plain-text').length })
    );
  });

  it('falls back to Object.prototype.toString.call(data) length when the data cannot be JSON.stringified', async () => {
    const circular: Record<string, unknown> = {};
    circular['self'] = circular;
    const context = buildContext();
    const callHandler: CallHandler = { handle: () => of(circular) };

    await firstValueFrom(interceptor.intercept(context, callHandler));

    const expectedSize = Object.prototype.toString.call(circular).length; // "[object Object]".length
    expect(span.setAttributes).toHaveBeenCalledWith(
      expect.objectContaining({ 'response.size': expectedSize })
    );
  });

  it('records 0 response size when data is null or undefined', async () => {
    const context = buildContext();
    const callHandler: CallHandler = { handle: () => of(null) };

    await firstValueFrom(interceptor.intercept(context, callHandler));

    expect(span.setAttributes).toHaveBeenCalledWith(
      expect.objectContaining({ 'response.size': 0 })
    );
  });

  it('on error, records error attributes, marks span ERROR, ends the span and rethrows', async () => {
    const context = buildContext();
    const error = { statusCode: 400, message: 'Bad request', name: 'BadRequestException' };
    const callHandler: CallHandler = { handle: () => throwError(() => error) };

    await expect(firstValueFrom(interceptor.intercept(context, callHandler))).rejects.toEqual(
      error
    );

    expect(span.setAttributes).toHaveBeenCalledWith(
      expect.objectContaining({
        'http.status_code': 400,
        'error.message': 'Bad request',
        'error.name': 'BadRequestException',
      })
    );
    expect(span.setStatus).toHaveBeenCalledWith({
      code: SpanStatusCode.ERROR,
      message: 'Bad request',
    });
    expect(span.end).toHaveBeenCalledTimes(1);
  });

  it('defaults error details to statusCode 500, "Unknown error" and "Error" for non-standard thrown values', async () => {
    const context = buildContext();
    const callHandler: CallHandler = { handle: () => throwError(() => 'just a string error') };

    await expect(firstValueFrom(interceptor.intercept(context, callHandler))).rejects.toBe(
      'just a string error'
    );

    expect(span.setAttributes).toHaveBeenCalledWith(
      expect.objectContaining({
        'http.status_code': 500,
        'error.message': 'Unknown error',
        'error.name': 'Error',
      })
    );
  });

  it('falls back to next.handle() without tracing when span/tracer initialization throws', async () => {
    (trace.getTracer as jest.Mock).mockImplementation(() => {
      throw new Error('tracer init failed');
    });
    const context = buildContext();
    const callHandler: CallHandler = { handle: () => of('fallback-response') };

    const result = await firstValueFrom(interceptor.intercept(context, callHandler));

    expect(result).toBe('fallback-response');
  });
});
