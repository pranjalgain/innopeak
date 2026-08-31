import { Public } from '@auth/decorators/public.decorator';
import { RouteNames } from '@common/route-names';
import { Body, Controller, Get, Post, VERSION_NEUTRAL } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Span } from '@opentelemetry/api';
import { OtelService } from '@otel/otel.service';

import { CustomTraceRequestDto } from './dto/custom-trace-request.dto';
import { CustomTraceResponseDto } from './dto/custom-trace-response.dto';
import { TestTraceResponseDto } from './dto/test-trace-response.dto';
import { TimedWorkSimulationResultDto } from './dto/timed-work-simulation-result.dto';
import { TracingStatusResponseDto } from './dto/tracing-status-response.dto';
import { WorkSimulationResultDto } from './dto/work-simulation-result.dto';

@ApiTags('Tracing')
@Controller({ path: RouteNames.TRACING, version: VERSION_NEUTRAL })
@Public()
export class TracingController {
  constructor(private readonly otelService: OtelService) {}

  @Get(RouteNames.TEST)
  @ApiOperation({ summary: 'Generate a test trace' })
  @ApiResponse({ status: 200, description: 'Test trace generated successfully' })
  generateTestTrace(): TestTraceResponseDto {
    const tracer = this.otelService.getTracer('tracing-controller', '1.0.0');

    return tracer.startActiveSpan('test-trace-endpoint', span => {
      try {
        span.setAttributes({
          'test.type': 'manual',
          'test.endpoint': '/tracing/test',
          'service.name': 'nestjs-app',
        });

        // Simulate some work
        const result = this.simulateWork(span);

        span.setStatus({ code: 1 }); // OK
        span.end();

        return {
          success: true,
          message: 'Test trace generated successfully',
          traceId: span.spanContext().traceId,
          spanId: span.spanContext().spanId,
          result,
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        span.setStatus({ code: 2, message: errorMessage }); // ERROR
        span.end();
        throw error;
      }
    });
  }

  @Post(RouteNames.CUSTOM)
  @ApiOperation({ summary: 'Generate a custom trace with data' })
  @ApiResponse({ status: 200, description: 'Custom trace generated successfully' })
  generateCustomTrace(@Body() data: CustomTraceRequestDto): CustomTraceResponseDto {
    const tracer = this.otelService.getTracer('tracing-controller', '1.0.0');

    return tracer.startActiveSpan(`custom-operation-${data.operation}`, span => {
      try {
        span.setAttributes({
          'operation.name': data.operation,
          'operation.duration': data.duration ?? 1000,
          'service.name': 'nestjs-app',
          'custom.data': JSON.stringify(data),
        });

        // Simulate work based on duration
        const duration = data.duration ?? 1000;
        const result = this.simulateWorkWithDuration(span, duration);

        span.setStatus({ code: 1 }); // OK
        span.end();

        return {
          success: true,
          message: `Custom trace for operation '${data.operation}' generated successfully`,
          traceId: span.spanContext().traceId,
          spanId: span.spanContext().spanId,
          operation: data.operation,
          duration,
          result,
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        span.setStatus({ code: 2, message: errorMessage }); // ERROR
        span.end();
        throw error;
      }
    });
  }

  @Get(RouteNames.STATUS)
  @ApiOperation({ summary: 'Get OpenTelemetry status' })
  @ApiResponse({ status: 200, description: 'OpenTelemetry status retrieved successfully' })
  getTracingStatus(): TracingStatusResponseDto {
    return {
      active: this.otelService.isActive(),
      service: 'nestjs-app',
      timestamp: new Date().toISOString(),
    };
  }

  private simulateWork(span: Span): WorkSimulationResultDto {
    span.addEvent('Starting work simulation');

    // Simulate some processing
    const start = Date.now();
    let result = 0;
    for (let i = 0; i < 1000000; i++) {
      result += Math.random();
    }
    const duration = Date.now() - start;

    span.setAttributes({
      'work.duration_ms': duration,
      'work.iterations': 1000000,
      'work.result': result,
    });

    span.addEvent('Work simulation completed', {
      duration: `${duration}ms`,
      result: result.toString(),
    });

    return {
      duration,
      iterations: 1000000,
      result: Math.round(result * 100) / 100,
    };
  }

  private simulateWorkWithDuration(
    span: Span,
    targetDuration: number
  ): TimedWorkSimulationResultDto {
    span.addEvent('Starting timed work simulation', { targetDuration });

    const start = Date.now();
    let iterations = 0;
    let result = 0;

    // Simulate work until we reach the target duration
    while (Date.now() - start < targetDuration) {
      result += Math.random();
      iterations++;
    }

    const actualDuration = Date.now() - start;

    span.setAttributes({
      'work.target_duration_ms': targetDuration,
      'work.actual_duration_ms': actualDuration,
      'work.iterations': iterations,
      'work.result': result,
    });

    span.addEvent('Timed work simulation completed', {
      targetDuration: `${targetDuration}ms`,
      actualDuration: `${actualDuration}ms`,
      iterations: iterations.toString(),
    });

    return {
      targetDuration,
      actualDuration,
      iterations,
      result: Math.round(result * 100) / 100,
    };
  }
}
