import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { context, trace } from '@opentelemetry/api';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { detectResources } from '@opentelemetry/resources';
import { NodeSDK } from '@opentelemetry/sdk-node';

import { OtelService } from './otel.service';

jest.mock('@opentelemetry/sdk-node');
jest.mock('@opentelemetry/resources', () => ({
  detectResources: jest.fn(),
  envDetector: {},
  processDetector: {},
  osDetector: {},
}));
jest.mock('@opentelemetry/auto-instrumentations-node', () => ({
  getNodeAutoInstrumentations: jest.fn(() => []),
}));
jest.mock('@opentelemetry/exporter-trace-otlp-proto', () => ({
  OTLPTraceExporter: jest.fn().mockImplementation(() => ({})),
}));
jest.mock('@opentelemetry/context-async-hooks', () => ({
  AsyncLocalStorageContextManager: jest.fn().mockImplementation(() => ({})),
}));

describe('OtelService', () => {
  let target: OtelService;
  let configGetMock: jest.Mock;
  let loggerLogSpy: jest.SpyInstance;
  let loggerWarnSpy: jest.SpyInstance;
  let loggerErrorSpy: jest.SpyInstance;
  let setGlobalContextManagerSpy: jest.SpyInstance;

  beforeEach(async () => {
    configGetMock = jest.fn();
    (detectResources as jest.Mock).mockReturnValue({ attributes: {} });
    (getNodeAutoInstrumentations as jest.Mock).mockReturnValue([]);

    loggerLogSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    loggerWarnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    loggerErrorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    setGlobalContextManagerSpy = jest
      .spyOn(context, 'setGlobalContextManager')
      .mockReturnValue(true);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OtelService,
        {
          provide: ConfigService,
          useValue: { get: configGetMock } as unknown as ConfigService,
        },
      ],
    }).compile();

    target = module.get(OtelService);
  });

  afterEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });

  describe('onModuleInit', () => {
    it('is a genuinely synchronous method: it returns undefined, not a Promise, having already done its work', () => {
      configGetMock.mockImplementation((key: string) => {
        if (key === 'NODE_ENV') return 'development';
        if (key === 'OTEL_SERVICE_NAME') return 'my-service';
        return undefined;
      });

      // Deliberately capture the return value (even though the method is typed `void`)
      // to prove onModuleInit() does not sneak in an async Promise under the hood.
      // eslint-disable-next-line @typescript-eslint/no-confusing-void-expression
      const result = target.onModuleInit();

      expect(result === undefined).toBe(true);
      expect((result as unknown as object) instanceof Promise).toBe(false);
      // If the method were still asynchronous under the hood, isActive() would not yet
      // reflect the SDK having been constructed and started by the time we get here.
      expect(target.isActive()).toBe(true);
      expect(loggerWarnSpy).not.toHaveBeenCalled();
    });

    it('skips SDK setup and logs a disabled message when NODE_ENV is not development', () => {
      configGetMock.mockImplementation((key: string) => {
        if (key === 'NODE_ENV') return 'production';
        return undefined;
      });

      target.onModuleInit();

      expect(loggerLogSpy).toHaveBeenCalledWith('OpenTelemetry is disabled in production mode.');
      expect(detectResources).not.toHaveBeenCalled();
      expect(NodeSDK).not.toHaveBeenCalled();
      expect(target.isActive()).toBe(false);
    });

    it('constructs and starts the NodeSDK with the detected resource and service metadata', () => {
      configGetMock.mockImplementation((key: string) => {
        if (key === 'NODE_ENV') return 'development';
        if (key === 'OTEL_SERVICE_NAME') return 'my-service';
        return undefined;
      });
      const resource: { attributes: Record<string, unknown> } = { attributes: {} };
      (detectResources as jest.Mock).mockReturnValue(resource);

      target.onModuleInit();

      expect(setGlobalContextManagerSpy).toHaveBeenCalledTimes(1);
      expect(detectResources).toHaveBeenCalledWith(
        expect.objectContaining({ detectors: expect.any(Array) })
      );
      expect(resource.attributes['service.name']).toBe('my-service');
      expect(resource.attributes['service.version']).toBe('1.0.0');

      expect(NodeSDK).toHaveBeenCalledTimes(1);
      const nodeSdkCtorArgs = (NodeSDK as jest.Mock).mock.calls[0][0] as {
        serviceName: string;
        resource: unknown;
      };
      expect(nodeSdkCtorArgs.serviceName).toBe('my-service');
      expect(nodeSdkCtorArgs.resource).toBe(resource);

      const nodeSdkInstance = (NodeSDK as jest.Mock).mock.instances[0] as { start: jest.Mock };
      expect(nodeSdkInstance.start).toHaveBeenCalledTimes(1);
      expect(target.isActive()).toBe(true);
    });

    it('defaults service name to "nestjs-app" when OTEL_SERVICE_NAME is not configured', () => {
      configGetMock.mockImplementation((key: string) => {
        if (key === 'NODE_ENV') return 'development';
        return undefined;
      });

      target.onModuleInit();

      const nodeSdkCtorArgs = (NodeSDK as jest.Mock).mock.calls[0][0] as { serviceName: string };
      expect(nodeSdkCtorArgs.serviceName).toBe('nestjs-app');
    });

    it('catches initialization errors (Error instance) and logs them without throwing', () => {
      configGetMock.mockImplementation((key: string) => {
        if (key === 'NODE_ENV') return 'development';
        return undefined;
      });
      (detectResources as jest.Mock).mockImplementation(() => {
        throw new Error('boom');
      });

      expect(() => {
        target.onModuleInit();
      }).not.toThrow();

      expect(loggerErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('❌ Failed to initialize OpenTelemetry: boom'),
        expect.any(String)
      );
      expect(target.isActive()).toBe(false);
    });

    it('catches non-Error initialization failures and reports "Unknown error"', () => {
      configGetMock.mockImplementation((key: string) => {
        if (key === 'NODE_ENV') return 'development';
        return undefined;
      });
      (detectResources as jest.Mock).mockImplementation(() => {
        // eslint-disable-next-line @typescript-eslint/only-throw-error
        throw 'a plain string failure';
      });

      target.onModuleInit();

      expect(loggerErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('❌ Failed to initialize OpenTelemetry: Unknown error'),
        undefined
      );
    });
  });

  describe('onModuleDestroy', () => {
    it('shuts down the SDK and logs when it was previously started', async () => {
      configGetMock.mockImplementation((key: string) => {
        if (key === 'NODE_ENV') return 'development';
        return undefined;
      });
      target.onModuleInit();
      const nodeSdkInstance = (NodeSDK as jest.Mock).mock.instances[0] as {
        shutdown: jest.Mock;
      };
      nodeSdkInstance.shutdown.mockResolvedValue(undefined);

      await target.onModuleDestroy();

      expect(nodeSdkInstance.shutdown).toHaveBeenCalledTimes(1);
      expect(loggerLogSpy).toHaveBeenCalledWith('🛑 OpenTelemetry SDK shut down');
    });

    it('does nothing when the SDK was never started', async () => {
      configGetMock.mockImplementation((key: string) => {
        if (key === 'NODE_ENV') return 'production';
        return undefined;
      });
      target.onModuleInit();

      await expect(target.onModuleDestroy()).resolves.toBeUndefined();
      expect(loggerLogSpy).not.toHaveBeenCalledWith('🛑 OpenTelemetry SDK shut down');
    });
  });

  describe('getTracer', () => {
    it('delegates to the global trace API', () => {
      const getTracerSpy = jest.spyOn(trace, 'getTracer');

      const tracer = target.getTracer('my-tracer', '2.0.0');

      expect(getTracerSpy).toHaveBeenCalledWith('my-tracer', '2.0.0');
      expect(tracer).toBeDefined();
    });
  });

  describe('isActive', () => {
    it('returns false before onModuleInit has run', () => {
      expect(target.isActive()).toBe(false);
    });

    it('returns false when initialization failed', () => {
      configGetMock.mockImplementation((key: string) => {
        if (key === 'NODE_ENV') return 'development';
        return undefined;
      });
      (detectResources as jest.Mock).mockImplementation(() => {
        throw new Error('nope');
      });

      target.onModuleInit();

      expect(target.isActive()).toBe(false);
    });
  });
});
