import type { MetricsService } from '@metrics/metrics.service';
import type { Request, Response } from 'express';

import { MetricsMiddleware } from './metrics.middleware';

describe('MetricsMiddleware', () => {
  let middleware: MetricsMiddleware;
  let metricsService: jest.Mocked<
    Pick<
      MetricsService,
      | 'decrementConcurrentRequests'
      | 'incrementApiErrorCounter'
      | 'incrementApiRequestCounter'
      | 'incrementConcurrentRequests'
      | 'incrementHttpRequests'
      | 'incrementMobileWebReqCounter'
      | 'incrementRefererCounter'
      | 'incrementUserAgentCounter'
      | 'observeRequestDuration'
    >
  >;
  let next: jest.Mock;
  let finishHandlers: Array<() => void>;

  const buildRequest = (overrides: Partial<Request> = {}): Request => {
    return {
      method: 'GET',
      originalUrl: '/v1/users/123',
      headers: {},
      ...overrides,
    } as unknown as Request;
  };

  const buildResponse = (statusCode = 200): Response => {
    return {
      statusCode,
      on: jest.fn((event: string, handler: () => void) => {
        if (event === 'finish') {
          finishHandlers.push(handler);
        }
      }),
    } as unknown as Response;
  };

  beforeEach(() => {
    finishHandlers = [];
    metricsService = {
      incrementHttpRequests: jest.fn(),
      incrementConcurrentRequests: jest.fn(),
      decrementConcurrentRequests: jest.fn(),
      observeRequestDuration: jest.fn(),
      incrementApiRequestCounter: jest.fn(),
      incrementApiErrorCounter: jest.fn(),
      incrementUserAgentCounter: jest.fn(),
      incrementRefererCounter: jest.fn(),
      incrementMobileWebReqCounter: jest.fn(),
    };
    middleware = new MetricsMiddleware(metricsService as unknown as MetricsService);
    next = jest.fn();
  });

  it('calls next() and increments request/concurrent counters synchronously', () => {
    const req = buildRequest();
    const res = buildResponse();

    middleware.use(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(metricsService.incrementHttpRequests).toHaveBeenCalledTimes(1);
    expect(metricsService.incrementConcurrentRequests).toHaveBeenCalledTimes(1);
  });

  it('extracts the route path from req.route when available (route templating instead of raw URL)', () => {
    const req = buildRequest({
      originalUrl: '/v1/users/123',
      route: { path: '/v1/users/:id' },
    } as Partial<Request>);
    const res = buildResponse(200);

    middleware.use(req, res, next);
    finishHandlers.forEach(handler => {
      handler();
    });

    expect(metricsService.observeRequestDuration).toHaveBeenCalledWith(
      'GET',
      '/v1/users/:id',
      '200',
      expect.any(Number)
    );
    expect(metricsService.incrementApiRequestCounter).toHaveBeenCalledWith(
      'GET',
      '/v1/users/:id',
      '200'
    );
  });

  it('falls back to originalUrl when req.route is not set', () => {
    const req = buildRequest({ originalUrl: '/v1/users/123' });
    const res = buildResponse(200);

    middleware.use(req, res, next);
    finishHandlers.forEach(handler => {
      handler();
    });

    expect(metricsService.observeRequestDuration).toHaveBeenCalledWith(
      'GET',
      '/v1/users/123',
      '200',
      expect.any(Number)
    );
  });

  it('records duration/counters and decrements concurrent requests on response finish', () => {
    const req = buildRequest();
    const res = buildResponse(200);

    middleware.use(req, res, next);
    finishHandlers.forEach(handler => {
      handler();
    });

    expect(metricsService.decrementConcurrentRequests).toHaveBeenCalledTimes(1);
    expect(metricsService.observeRequestDuration).toHaveBeenCalledWith(
      'GET',
      '/v1/users/123',
      '200',
      expect.any(Number)
    );
    expect(metricsService.incrementApiRequestCounter).toHaveBeenCalledWith(
      'GET',
      '/v1/users/123',
      '200'
    );
    expect(metricsService.incrementApiErrorCounter).not.toHaveBeenCalled();
  });

  it('increments the API error counter when the response status is >= 400', () => {
    const req = buildRequest();
    const res = buildResponse(404);

    middleware.use(req, res, next);
    finishHandlers.forEach(handler => {
      handler();
    });

    expect(metricsService.incrementApiErrorCounter).toHaveBeenCalledWith(
      'GET',
      '/v1/users/123',
      '404'
    );
  });

  it('records "unknown" for user-agent and referer counters when the headers are absent', () => {
    // `userAgentRaw`/`refererRaw` already default to 'unknown' before the `?? ''`
    // fallback is applied, so the counters see 'unknown' rather than ''.
    const req = buildRequest({ headers: {} });
    const res = buildResponse(200);

    middleware.use(req, res, next);
    finishHandlers.forEach(handler => {
      handler();
    });

    expect(metricsService.incrementUserAgentCounter).toHaveBeenCalledWith('unknown');
    expect(metricsService.incrementRefererCounter).toHaveBeenCalledWith('unknown');
  });

  it('prefers x-forwarded-user-agent over user-agent, and unwraps array header values', () => {
    const req = buildRequest({
      headers: {
        'x-forwarded-user-agent': ['forwarded-agent'],
        'user-agent': 'direct-agent',
        referer: ['https://example.com'],
      } as unknown as Request['headers'],
    });
    const res = buildResponse(200);

    middleware.use(req, res, next);
    finishHandlers.forEach(handler => {
      handler();
    });

    expect(metricsService.incrementUserAgentCounter).toHaveBeenCalledWith('forwarded-agent');
    expect(metricsService.incrementRefererCounter).toHaveBeenCalledWith('https://example.com');
  });

  it('flags mobile requests via the x-device header', () => {
    const req = buildRequest({ headers: { 'x-device': 'mobile' } });
    const res = buildResponse(200);

    middleware.use(req, res, next);
    finishHandlers.forEach(handler => {
      handler();
    });

    expect(metricsService.incrementMobileWebReqCounter).toHaveBeenCalledWith(true);
  });

  it('flags non-mobile requests when the x-device header is absent', () => {
    const req = buildRequest({ headers: {} });
    const res = buildResponse(200);

    middleware.use(req, res, next);
    finishHandlers.forEach(handler => {
      handler();
    });

    expect(metricsService.incrementMobileWebReqCounter).toHaveBeenCalledWith(false);
  });
});
