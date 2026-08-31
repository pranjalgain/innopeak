import { Injectable } from '@nestjs/common';
import { Counter, Gauge, Histogram } from 'prom-client';
import { UAParser } from 'ua-parser-js';

@Injectable()
export class MetricsService {
  private readonly totalHttpRequests: Counter<string>;
  private readonly concurrentRequests: Gauge<string>;
  private readonly activeUsersGauge: Gauge<string>;
  private readonly apiRequestDuration: Histogram<string>;
  private readonly apiRequestCounter: Counter<string>;
  private readonly apiErrorCounter: Counter<string>;
  private readonly userAgentCounter: Counter<string>;
  private readonly refererCounter: Counter<string>;
  private readonly totalMobileRequests: Counter<string>;
  private readonly totalWebRequests: Counter<string>;

  constructor() {
    this.totalHttpRequests = new Counter({
      name: 'total_http_requests',
      help: 'Total number of HTTP requests',
    });

    this.concurrentRequests = new Gauge({
      name: 'concurrent_http_requests',
      help: 'Number of concurrent HTTP requests',
    });

    this.activeUsersGauge = new Gauge({
      name: 'active_users_gauge',
      help: 'Number of active unique IP addresses in the last 5 minutes',
    });

    this.apiRequestDuration = new Histogram({
      name: 'api_request_duration_seconds',
      help: 'Duration of API requests in seconds',
      labelNames: ['method', 'route', 'status'],
      buckets: [0.1, 0.3, 0.5, 1, 1.5, 2, 5, 10],
    });

    this.apiRequestCounter = new Counter({
      name: 'api_requests_total',
      help: 'Total number of API requests',
      labelNames: ['method', 'route', 'status'],
    });

    this.apiErrorCounter = new Counter({
      name: 'api_request_errors_total',
      help: 'Total number of API request failures',
      labelNames: ['method', 'route', 'status'],
    });

    this.userAgentCounter = new Counter({
      name: 'api_requests_by_user_agent',
      help: 'Total requests grouped by browser',
      labelNames: ['browser_family'],
    });

    this.refererCounter = new Counter({
      name: 'api_requests_by_referer',
      help: 'Total requests grouped by referer domain',
      labelNames: ['referer_domain'],
    });

    this.totalMobileRequests = new Counter({
      name: 'total_mobile_requests',
      help: 'Total requests grouped by Mobile',
      labelNames: ['mobile_request'],
    });

    this.totalWebRequests = new Counter({
      name: 'total_web_requests',
      help: 'Total requests grouped by Web',
      labelNames: ['web_request'],
    });
  }

  incrementHttpRequests(): void {
    this.totalHttpRequests.inc();
  }

  incrementConcurrentRequests(): void {
    this.concurrentRequests.inc();
  }

  decrementConcurrentRequests(): void {
    this.concurrentRequests.dec();
  }

  setActiveUsers(value: number): void {
    this.activeUsersGauge.set(value);
  }

  observeRequestDuration(method: string, route: string, status: string, duration: number): void {
    this.apiRequestDuration.labels(method, route, status).observe(duration);
  }

  incrementApiRequestCounter(method: string, route: string, status: string): void {
    this.apiRequestCounter.labels(method, route, status).inc();
  }

  incrementApiErrorCounter(method: string, route: string, status: string): void {
    this.apiErrorCounter.labels(method, route, status).inc();
  }

  incrementUserAgentCounter(userAgentString: string): void {
    const parser = new UAParser(userAgentString || '');
    const browserFamily = parser.getBrowser().name ?? 'Unknown';
    this.userAgentCounter.labels(browserFamily).inc();
  }

  incrementRefererCounter(refererString: string): void {
    if (!refererString) {
      this.refererCounter.labels('unknown').inc();
      return;
    }
    try {
      const url = new URL(refererString);
      const hostname = url.hostname || 'unknown';
      this.refererCounter.labels(hostname).inc();
    } catch {
      this.refererCounter.labels('invalid-url').inc();
    }
  }

  incrementMobileWebReqCounter(isMobile: boolean): void {
    if (isMobile) this.totalMobileRequests.inc();
    else this.totalWebRequests.inc();
  }
}
