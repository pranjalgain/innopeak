import { HealthIndicatorService } from '@nestjs/terminus';

import { CustomHttpHealthIndicator } from './custom-http-health.indicator';

describe('CustomHttpHealthIndicator', () => {
  let target: CustomHttpHealthIndicator;
  let fetchMock: jest.Mock;
  const originalFetch = global.fetch;

  beforeEach(() => {
    fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
    target = new CustomHttpHealthIndicator(new HealthIndicatorService());
  });

  afterEach(() => jest.clearAllMocks());

  afterAll(() => {
    global.fetch = originalFetch;
  });

  it('reports up with the response status when the request succeeds', async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200, statusText: 'OK' });

    const result = await target.pingCheck('google', 'https://google.com');

    expect(result).toEqual({
      google: { status: 'up', httpStatus: 200, url: 'https://google.com' },
    });
  });

  it('reports down with the status text when the response is not ok', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 503, statusText: 'Service Unavailable' });

    const result = await target.pingCheck('google', 'https://google.com');

    expect(result).toEqual({
      google: {
        status: 'down',
        error: 'HTTP 503: Service Unavailable',
        url: 'https://google.com',
      },
    });
  });

  it('reports down with the error message when fetch rejects', async () => {
    fetchMock.mockRejectedValue(new Error('network error'));

    const result = await target.pingCheck('google', 'https://google.com');

    expect(result).toEqual({
      google: { status: 'down', error: 'network error', url: 'https://google.com' },
    });
  });
});
