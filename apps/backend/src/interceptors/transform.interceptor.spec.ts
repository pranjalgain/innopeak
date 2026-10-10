import { MESSAGES } from '@common/constants/messages.constants';
import { toStoredMessage } from '@common/i18n/message-registry';
import { RouteNames } from '@common/route-names';
import type { CallHandler, ExecutionContext } from '@nestjs/common';
import { firstValueFrom, of } from 'rxjs';

import { TransformInterceptor } from './transform.interceptor';

import { messagesDe } from '../common/i18n/messages.de';
import { messagesEn } from '../common/i18n/messages.en';

describe('TransformInterceptor', () => {
  let interceptor: TransformInterceptor<unknown>;

  const buildHttpContext = (
    url: string,
    statusCode = 200,
    headers: Record<string, string> = {}
  ): ExecutionContext => {
    const request = { url, headers };
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

  it('renders a MESSAGES-derived message in German when Accept-Language asks for it', async () => {
    const context = buildHttpContext('/v1/settings', 200, { 'accept-language': 'de' });
    const callHandler: CallHandler = {
      handle: () => of({ status: 'Success', message: MESSAGES.SETTINGS.UPDATED, data: null }),
    };

    const result = await firstValueFrom(interceptor.intercept(context, callHandler));

    expect(result).toMatchObject({ message: messagesDe.SETTINGS.UPDATED });
  });

  it('renders the same MESSAGES-derived message in English by default (no Accept-Language)', async () => {
    const context = buildHttpContext('/v1/settings', 200);
    const callHandler: CallHandler = {
      handle: () => of({ status: 'Success', message: MESSAGES.SETTINGS.UPDATED, data: null }),
    };

    const result = await firstValueFrom(interceptor.intercept(context, callHandler));

    expect(result).toMatchObject({ message: messagesEn.SETTINGS.UPDATED });
  });

  it('renders the default success message (no message on the payload at all) in the resolved locale', async () => {
    const context = buildHttpContext('/v1/users', 200, { 'accept-language': 'de' });
    const callHandler: CallHandler = { handle: () => of({ id: 1 }) };

    const result = await firstValueFrom(interceptor.intercept(context, callHandler));

    expect(result).toMatchObject({ message: messagesDe.COMMON.REQUEST_SUCCESSFUL });
  });

  // A reply's stored failure reason must reach a German owner in German, not in the language it was written in.
  it('renders a stored message inside data in the resolved locale', async () => {
    const context = buildHttpContext('/v1/reviews', 200, { 'accept-language': 'de' });
    const callHandler: CallHandler = {
      handle: () =>
        of({
          status: 'Success',
          data: {
            replyDrafts: [
              { errorMessage: toStoredMessage(MESSAGES.REVIEWS.POST_FAILED_REVIEW_REMOVED) },
            ],
          },
        }),
    };

    const result = await firstValueFrom(interceptor.intercept(context, callHandler));

    expect(result).toMatchObject({
      data: { replyDrafts: [{ errorMessage: messagesDe.REVIEWS.POST_FAILED_REVIEW_REMOVED }] },
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

  /** Regression: `partial.data ?? data` double-wrapped an envelope whose own `data` is null (void mutations). */
  it('preserves an explicit null data payload instead of double-wrapping the envelope', async () => {
    const context = buildHttpContext('/v1/billing/cancel');
    const callHandler: CallHandler = {
      handle: () =>
        of({ status: 'Success', message: 'Subscription cancellation scheduled', data: null }),
    };

    const result = await firstValueFrom(interceptor.intercept(context, callHandler));

    expect(result).toEqual({
      statusCode: 200,
      status: 'Success',
      message: 'Subscription cancellation scheduled',
      data: null,
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
