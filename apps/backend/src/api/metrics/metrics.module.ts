import { MetricsController } from '@metrics/metrics.controller';
import { Module, OnModuleInit } from '@nestjs/common';
import { collectDefaultMetrics } from 'prom-client';

/**
 * `/metrics` with Node's default process metrics (event loop lag, memory, GC, handles). Nothing app-specific is recorded: it exists
 * so a platform that already runs Prometheus can scrape the process. `createMetricsGuard` puts a bearer token in front of it.
 */
@Module({ controllers: [MetricsController] })
export class MetricsModule implements OnModuleInit {
  onModuleInit(): void {
    collectDefaultMetrics();
  }
}
