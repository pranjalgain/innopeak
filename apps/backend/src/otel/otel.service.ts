import { EnvConfig } from '@config/env.config';
import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Tracer } from '@opentelemetry/api';
import { context, trace } from '@opentelemetry/api';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { AsyncLocalStorageContextManager } from '@opentelemetry/context-async-hooks';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-proto';
import {
  detectResources,
  envDetector,
  osDetector,
  processDetector,
} from '@opentelemetry/resources';
import { NodeSDK } from '@opentelemetry/sdk-node';

@Injectable()
export class OtelService implements OnModuleInit, OnModuleDestroy {
  private sdk: NodeSDK | null = null;
  private readonly logger = new Logger(OtelService.name);

  constructor(private readonly config: ConfigService<EnvConfig>) {}

  onModuleInit(): void {
    try {
      const env = this.config.get<string>('NODE_ENV') ?? 'development';
      const enableOtel = env === 'development';
      if (!enableOtel) {
        this.logger.log(`OpenTelemetry is disabled in ${env} mode.`);
        return;
      }

      const serviceName = this.config.get<string>('OTEL_SERVICE_NAME') ?? 'nestjs-app';
      // Hardcoded localhost: the jaeger hostname is not resolvable from the host.
      const otlpEndpoint = 'http://localhost:4318/v1/traces';

      this.logger.log(`🚀 Initializing OpenTelemetry for service: ${serviceName}`);
      this.logger.log(`📤 OTLP Endpoint: ${otlpEndpoint}`);

      context.setGlobalContextManager(new AsyncLocalStorageContextManager());

      const resource = detectResources({
        detectors: [envDetector, processDetector, osDetector],
      });

      resource.attributes['service.name'] = serviceName;
      resource.attributes['service.version'] = '1.0.0';

      const traceExporter = new OTLPTraceExporter({
        url: otlpEndpoint,
        headers: {
          'Content-Type': 'application/x-protobuf',
        },
      });

      this.sdk = new NodeSDK({
        serviceName,
        resource,
        contextManager: new AsyncLocalStorageContextManager(),
        traceExporter,
        instrumentations: [
          getNodeAutoInstrumentations({
            // Disabled because they can cause issues.
            '@opentelemetry/instrumentation-fs': {
              enabled: false,
            },
            '@opentelemetry/instrumentation-dns': {
              enabled: false,
            },
          }),
        ],
      });

      this.sdk.start();

      this.logger.log(`✅ OpenTelemetry tracing started for: ${serviceName}`);
      this.logger.log(`📤 Exporting traces to: ${otlpEndpoint}`);

      this.generateTestTrace();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const errorStack = error instanceof Error ? error.stack : undefined;
      this.logger.error(`❌ Failed to initialize OpenTelemetry: ${errorMessage}`, errorStack);
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.sdk) {
      await this.sdk.shutdown();
      this.logger.log('🛑 OpenTelemetry SDK shut down');
    }
  }

  private generateTestTrace(): void {
    try {
      const tracer = trace.getTracer('nestjs-app', '1.0.0');
      const span = tracer.startSpan('otel-test-trace');

      span.setAttributes({
        'test.type': 'initialization',
        'test.status': 'success',
        'service.name': 'nestjs-app',
      });

      span.addEvent('OpenTelemetry initialized successfully');
      span.end();

      this.logger.log('🧪 Test trace generated successfully');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.warn(`⚠️ Failed to generate test trace: ${errorMessage}`);
    }
  }

  getTracer(name: string, version?: string): Tracer {
    return trace.getTracer(name, version);
  }

  isActive(): boolean {
    return this.sdk !== null;
  }
}
