import { RouteNames } from '@common/route-names';
import type { CallHandler, ExecutionContext } from '@nestjs/common';
import { firstValueFrom, of } from 'rxjs';

import { TransformInterceptor } from './transform.interceptor';

describe('TransformInterceptor', () => {
  let interceptor: TransformInterceptor<unknown>;

  const buildHttpContext = (url: string, statusCode = 200): ExecutionContext => {
    const request = { url };
    const response = { statusCode };

    return {
      getType: () => 'http',
      switchToHttp: () => ({
        getRequest: () => request,
        getResponse: () => response,
      }),
      getHandler: jest.fn(),
      getClass: jest.fn(),
    } as unknown as ExecutionContext;
  };

  beforeEach(() => {
    interceptor = new TransformInterceptor();
  });

  it('wraps a plain success payload in the standard envelope', async () => {
    const context = buildHttpContext('/v1/users');
    const callHandler: CallHandler = { handle: () => of({ id: 1, name: 'Ada' }) };

    const result = await firstValueFrom(interceptor.intercept(context, callHandler));

    expect(result).toEqual({
      statusCode: 200,
      status: 'Success',
      message: 'Request successful',
      data: { id: 1, name: 'Ada' },
    });
  });

  it('preserves an explicit statusCode/status/message already present on the payload', async () => {
    const context = buildHttpContext('/v1/users', 200);
    const callHandler: CallHandler = {
      handle: () =>
        of({
          statusCode: 201,
          status: 'Created',
          message: 'User created',
          data: { id: 2 },
        }),
    };

    const result = await firstValueFrom(interceptor.intercept(context, callHandler));

    expect(result).toEqual({
      statusCode: 201,
      status: 'Created',
      message: 'User created',
      data: { id: 2 },
    });
  });

  it('includes the error key only when present on the payload (exactOptionalPropertyTypes fix)', async () => {
    const context = buildHttpContext('/v1/users');
    const callHandler: CallHandler = {
      handle: () => of({ status: 'Partial', error: 'something minor failed', data: null }),
    };

    const result = await firstValueFrom(interceptor.intercept(context, callHandler));

    expect(result).toEqual(
      expect.objectContaining({
        status: 'Partial',
        error: 'something minor failed',
      })
    );
    expect(Object.prototype.hasOwnProperty.call(result, 'error')).toBe(true);
  });

  it('omits the error key entirely when the payload has no error field', async () => {
    const context = buildHttpContext('/v1/users');
    const callHandler: CallHandler = { handle: () => of({ data: 'ok' }) };

    const result = await firstValueFrom(interceptor.intercept(context, callHandler));

    expect(Object.prototype.hasOwnProperty.call(result, 'error')).toBe(false);
  });

  it('treats primitive (non-object) response data as the data payload itself', async () => {
    const context = buildHttpContext('/v1/ping');
    const callHandler: CallHandler = { handle: () => of('pong') };

    const result = await firstValueFrom(interceptor.intercept(context, callHandler));

    expect(result).toEqual({
      statusCode: 200,
      status: 'Success',
      message: 'Request successful',
      data: 'pong',
    });
  });

  it('bypasses transformation for metrics routes', async () => {
    const context = buildHttpContext(`/${RouteNames.METRICS}`);
    const callHandler: CallHandler = { handle: () => of('raw-metrics-text') };

    const result = await firstValueFrom(interceptor.intercept(context, callHandler));

    expect(result).toBe('raw-metrics-text');
  });

  it('bypasses transformation for health routes', async () => {
    const context = buildHttpContext(`/${RouteNames.HEALTH}`);
    const callHandler: CallHandler = { handle: () => of({ status: 'ok' }) };

    const result = await firstValueFrom(interceptor.intercept(context, callHandler));

    expect(result).toEqual({ status: 'ok' });
  });

  it('transforms GraphQL context payloads into the standard envelope', async () => {
    const context = {
      getType: () => 'graphql',
      getHandler: jest.fn(),
      getClass: jest.fn(),
    } as unknown as ExecutionContext;
    const callHandler: CallHandler = { handle: () => of({ id: 5 }) };

    const result = await firstValueFrom(interceptor.intercept(context, callHandler));

    expect(result).toEqual({
      statusCode: 200,
      status: 'Success',
      message: 'Request successful',
      data: { id: 5 },
      error: '',
    });
  });

  it('passes through unmodified for other (e.g. rpc) context types', async () => {
    const context = {
      getType: () => 'rpc',
      getHandler: jest.fn(),
      getClass: jest.fn(),
    } as unknown as ExecutionContext;
    const callHandler: CallHandler = { handle: () => of('rpc-raw') };

    const result = await firstValueFrom(interceptor.intercept(context, callHandler));

    expect(result).toBe('rpc-raw');
  });
});
