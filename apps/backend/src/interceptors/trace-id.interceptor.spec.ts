import type { CallHandler, ExecutionContext } from '@nestjs/common';
import { context, trace } from '@opentelemetry/api';
import { firstValueFrom, of, throwError } from 'rxjs';

import { TraceIdInterceptor } from './trace-id.interceptor';

jest.mock('@opentelemetry/api', () => ({
  context: { active: jest.fn() },
  trace: { getSpan: jest.fn() },
}));

describe('TraceIdInterceptor', () => {
  let interceptor: TraceIdInterceptor;
  let response: { setHeader: jest.Mock };

  const buildContext = (): ExecutionContext => {
    return {
      switchToHttp: () => ({
        getRequest: () => ({}),
        getResponse: () => response,
      }),
      getHandler: jest.fn(),
      getClass: jest.fn(),
    } as unknown as ExecutionContext;
  };

  beforeEach(() => {
    interceptor = new TraceIdInterceptor();
    response = { setHeader: jest.fn() };
    (context.active as jest.Mock).mockReturnValue('active-ctx');
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('propagates x-trace-id and x-span-id headers from the active span onto the response', async () => {
    (trace.getSpan as jest.Mock).mockReturnValue({
      spanContext: () => ({ traceId: 'trace-123', spanId: 'span-456' }),
    });
    const httpContext = buildContext();
    const callHandler: CallHandler = { handle: () => of('ok') };

    const result = await firstValueFrom(interceptor.intercept(httpContext, callHandler));

    expect(result).toBe('ok');
    expect(response.setHeader).toHaveBeenCalledWith('x-trace-id', 'trace-123');
    expect(response.setHeader).toHaveBeenCalledWith('x-span-id', 'span-456');
  });

  it('does not set trace/span headers when there is no active span', async () => {
    (trace.getSpan as jest.Mock).mockReturnValue(undefined);
    const httpContext = buildContext();
    const callHandler: CallHandler = { handle: () => of('ok') };

    await firstValueFrom(interceptor.intercept(httpContext, callHandler));

    expect(response.setHeader).not.toHaveBeenCalled();
  });

  it('re-sets the trace/span headers and rethrows when the downstream handler errors', async () => {
    (trace.getSpan as jest.Mock).mockReturnValue({
      spanContext: () => ({ traceId: 'trace-err', spanId: 'span-err' }),
    });
    const httpContext = buildContext();
    const error = new Error('boom');
    const callHandler: CallHandler = { handle: () => throwError(() => error) };

    await expect(firstValueFrom(interceptor.intercept(httpContext, callHandler))).rejects.toThrow(
      'boom'
    );

    // Called once before subscribing to next.handle(), and once more in catchError.
    expect(response.setHeader).toHaveBeenCalledWith('x-trace-id', 'trace-err');
    expect(response.setHeader).toHaveBeenCalledWith('x-span-id', 'span-err');
    expect(response.setHeader).toHaveBeenCalledTimes(4);
  });
});
