import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { register } from 'prom-client';

import { MetricsService } from './metrics.service';

describe('MetricsService', () => {
  let target: MetricsService;

  beforeEach(async () => {
    // MetricsService registers its counters/gauges/histograms on prom-client's default
    // global registry. Clear it before each test so re-instantiating the service in a
    // fresh TestingModule doesn't throw "metric already registered" errors.
    register.clear();

    const module: TestingModule = await Test.createTestingModule({
      providers: [MetricsService],
    }).compile();

    target = module.get(MetricsService);
  });

  afterEach(() => {
    jest.clearAllMocks();
    register.clear();
  });

  interface MetricSnapshot {
    name: string;
    values: Array<{ labels: Record<string, string>; value: number; metricName?: string }>;
  }

  async function metricValue(name: string): Promise<MetricSnapshot | undefined> {
    const json = await register.getMetricsAsJSON();
    return json.find(m => m.name === name) as MetricSnapshot | undefined;
  }

  it('increments total http requests counter', async () => {
    target.incrementHttpRequests();
    target.incrementHttpRequests();

    const metric = await metricValue('total_http_requests');
    expect(metric?.['values']).toEqual([expect.objectContaining({ value: 2 })]);
  });

  it('increments and decrements the concurrent requests gauge', async () => {
    target.incrementConcurrentRequests();
    target.incrementConcurrentRequests();
    target.decrementConcurrentRequests();

    const metric = await metricValue('concurrent_http_requests');
    expect(metric?.['values']).toEqual([expect.objectContaining({ value: 1 })]);
  });

  it('sets the active users gauge to an explicit value', async () => {
    target.setActiveUsers(42);

    const metric = await metricValue('active_users_gauge');
    expect(metric?.['values']).toEqual([expect.objectContaining({ value: 42 })]);
  });

  it('observes request duration in the histogram with labels', async () => {
    target.observeRequestDuration('GET', '/users', '200', 0.42);

    const metric = await metricValue('api_request_duration_seconds');
    const values = metric?.['values'] as Array<{
      labels: Record<string, string>;
      metricName: string;
    }>;
    const sumEntry = values.find(v => v.metricName === 'api_request_duration_seconds_sum');
    expect(sumEntry?.labels).toEqual({ method: 'GET', route: '/users', status: '200' });
  });

  it('increments the api request counter with labels', async () => {
    target.incrementApiRequestCounter('POST', '/orders', '201');

    const metric = await metricValue('api_requests_total');
    const values = metric?.['values'] as Array<{ labels: Record<string, string>; value: number }>;
    expect(values).toEqual([
      expect.objectContaining({
        labels: { method: 'POST', route: '/orders', status: '201' },
        value: 1,
      }),
    ]);
  });

  it('increments the api error counter with labels', async () => {
    target.incrementApiErrorCounter('POST', '/orders', '500');

    const metric = await metricValue('api_request_errors_total');
    const values = metric?.['values'] as Array<{ labels: Record<string, string>; value: number }>;
    expect(values).toEqual([
      expect.objectContaining({
        labels: { method: 'POST', route: '/orders', status: '500' },
        value: 1,
      }),
    ]);
  });

  it('increments the user agent counter using the parsed browser family', async () => {
    const chromeUa =
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0 Safari/537.36';

    target.incrementUserAgentCounter(chromeUa);

    const metric = await metricValue('api_requests_by_user_agent');
    const values = metric?.['values'] as Array<{ labels: Record<string, string>; value: number }>;
    expect(values[0]?.labels['browser_family']).toBe('Chrome');
    expect(values[0]?.value).toBe(1);
  });

  it('falls back to Unknown browser family for an empty user agent string', async () => {
    target.incrementUserAgentCounter('');

    const metric = await metricValue('api_requests_by_user_agent');
    const values = metric?.['values'] as Array<{ labels: Record<string, string>; value: number }>;
    expect(values[0]?.labels['browser_family']).toBe('Unknown');
  });

  it('increments the referer counter using the hostname of a valid URL', async () => {
    target.incrementRefererCounter('https://example.com/page');

    const metric = await metricValue('api_requests_by_referer');
    const values = metric?.['values'] as Array<{ labels: Record<string, string>; value: number }>;
    expect(values[0]?.labels['referer_domain']).toBe('example.com');
  });

  it('labels an empty referer as unknown', async () => {
    target.incrementRefererCounter('');

    const metric = await metricValue('api_requests_by_referer');
    const values = metric?.['values'] as Array<{ labels: Record<string, string>; value: number }>;
    expect(values[0]?.labels['referer_domain']).toBe('unknown');
  });

  it('labels a malformed referer URL as invalid-url', async () => {
    target.incrementRefererCounter('not-a-valid-url');

    const metric = await metricValue('api_requests_by_referer');
    const values = metric?.['values'] as Array<{ labels: Record<string, string>; value: number }>;
    expect(values[0]?.labels['referer_domain']).toBe('invalid-url');
  });

  it('increments the mobile requests counter for mobile traffic', async () => {
    target.incrementMobileWebReqCounter(true);

    const mobileMetric = await metricValue('total_mobile_requests');
    const webMetric = await metricValue('total_web_requests');
    expect((mobileMetric?.['values'] as Array<{ value: number }>)[0]?.value).toBe(1);
    expect((webMetric?.['values'] as Array<{ value: number }>) ?? []).toEqual([]);
  });

  it('increments the web requests counter for non-mobile traffic', async () => {
    target.incrementMobileWebReqCounter(false);

    const webMetric = await metricValue('total_web_requests');
    expect((webMetric?.['values'] as Array<{ value: number }>)[0]?.value).toBe(1);
  });
});
