import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import type { Span, Tracer } from '@opentelemetry/api';
import { OtelService } from '@otel/otel.service';

import { TracingController } from './tracing.controller';

describe('TracingController', () => {
  let target: TracingController;
  let otelService: { getTracer: jest.Mock; isActive: jest.Mock };
  let span: {
    setAttribute: jest.Mock;
    setAttributes: jest.Mock;
    setStatus: jest.Mock;
    addEvent: jest.Mock;
    end: jest.Mock;
    recordException: jest.Mock;
    spanContext: jest.Mock;
  };
  let tracer: { startActiveSpan: jest.Mock };

  beforeEach(async () => {
    span = {
      setAttribute: jest.fn(),
      setAttributes: jest.fn(),
      setStatus: jest.fn(),
      addEvent: jest.fn(),
      end: jest.fn(),
      recordException: jest.fn(),
      spanContext: jest.fn().mockReturnValue({ traceId: 'trace-123', spanId: 'span-456' }),
    };

    tracer = {
      startActiveSpan: jest.fn((_name: string, callback: (span: Span) => unknown) =>
        callback(span as unknown as Span)
      ),
    };

    otelService = {
      getTracer: jest.fn().mockReturnValue(tracer as unknown as Tracer),
      isActive: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [TracingController],
      providers: [{ provide: OtelService, useValue: otelService }],
    }).compile();

    target = module.get(TracingController);
  });

  afterEach(() => jest.clearAllMocks());

  describe('generateTestTrace', () => {
    it('generates a successful test trace and marks the span OK', () => {
      const result = target.generateTestTrace();

      expect(otelService.getTracer).toHaveBeenCalledWith('tracing-controller', '1.0.0');
      expect(tracer.startActiveSpan).toHaveBeenCalledWith(
        'test-trace-endpoint',
        expect.any(Function)
      );
      expect(span.setAttributes).toHaveBeenCalledWith(
        expect.objectContaining({ 'test.type': 'manual', 'test.endpoint': '/tracing/test' })
      );
      expect(span.setStatus).toHaveBeenCalledWith({ code: 1 });
      expect(span.end).toHaveBeenCalled();

      expect(result).toEqual({
        success: true,
        message: 'Test trace generated successfully',
        traceId: 'trace-123',
        spanId: 'span-456',
        result: expect.objectContaining({ iterations: 1000000 }),
      });
    });

    it('marks the span as an error and rethrows when work simulation fails', () => {
      span.addEvent.mockImplementationOnce(() => {
        throw new Error('simulation blew up');
      });

      expect(() => target.generateTestTrace()).toThrow('simulation blew up');

      expect(span.setStatus).toHaveBeenCalledWith({ code: 2, message: 'simulation blew up' });
      expect(span.end).toHaveBeenCalled();
    });
  });

  describe('generateCustomTrace', () => {
    it('generates a custom trace using the provided operation and default duration', () => {
      const result = target.generateCustomTrace({ operation: 'sync-users' });

      expect(otelService.getTracer).toHaveBeenCalledWith('tracing-controller', '1.0.0');
      expect(tracer.startActiveSpan).toHaveBeenCalledWith(
        'custom-operation-sync-users',
        expect.any(Function)
      );
      expect(span.setAttributes).toHaveBeenCalledWith(
        expect.objectContaining({ 'operation.name': 'sync-users', 'operation.duration': 1000 })
      );
      expect(span.setStatus).toHaveBeenCalledWith({ code: 1 });
      expect(span.end).toHaveBeenCalled();

      expect(result).toEqual({
        success: true,
        message: "Custom trace for operation 'sync-users' generated successfully",
        traceId: 'trace-123',
        spanId: 'span-456',
        operation: 'sync-users',
        duration: 1000,
        result: expect.objectContaining({ targetDuration: 1000 }),
      });
    });

    it('honors an explicit duration for the timed work simulation', () => {
      const result = target.generateCustomTrace({ operation: 'export-report', duration: 5 });

      expect(span.setAttributes).toHaveBeenCalledWith(
        expect.objectContaining({ 'operation.duration': 5 })
      );
      expect(result.duration).toBe(5);
      expect(result.result.targetDuration).toBe(5);
      expect(result.result.actualDuration).toBeGreaterThanOrEqual(0);
    });

    it('marks the span as an error and rethrows when the custom trace work fails', () => {
      span.addEvent.mockImplementationOnce(() => {
        throw new Error('custom work blew up');
      });

      expect(() => target.generateCustomTrace({ operation: 'failing-op', duration: 1 })).toThrow(
        'custom work blew up'
      );

      expect(span.setStatus).toHaveBeenCalledWith({ code: 2, message: 'custom work blew up' });
      expect(span.end).toHaveBeenCalled();
    });
  });

  describe('getTracingStatus', () => {
    it('reports active status from the OtelService', () => {
      otelService.isActive.mockReturnValue(true);

      const result = target.getTracingStatus();

      expect(result.active).toBe(true);
      expect(result.service).toBe('nestjs-app');
      expect(typeof result.timestamp).toBe('string');
      expect(() => new Date(result.timestamp)).not.toThrow();
    });

    it('reports inactive status from the OtelService', () => {
      otelService.isActive.mockReturnValue(false);

      const result = target.getTracingStatus();

      expect(result.active).toBe(false);
    });
  });
});
