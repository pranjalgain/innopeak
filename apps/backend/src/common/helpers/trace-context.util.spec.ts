import type { Span, SpanContext } from '@opentelemetry/api';
import { context, trace } from '@opentelemetry/api';
import { AsyncHooksContextManager } from '@opentelemetry/context-async-hooks';

import { getTraceContext } from './trace-context.util';

describe('getTraceContext', () => {
  // The default no-op context manager doesn't actually track active context, so
  // `context.with(...)` would be a no-op and every span lookup would return
  // undefined. Registering a real context manager lets us exercise the
  // "active span present" branch faithfully.
  let contextManager: AsyncHooksContextManager;

  beforeEach(() => {
    contextManager = new AsyncHooksContextManager();
    contextManager.enable();
    context.setGlobalContextManager(contextManager);
  });

  afterEach(() => {
    contextManager.disable();
    context.disable();
  });

  it('returns an empty object when there is no active span', () => {
    const result = getTraceContext();
    expect(result).toEqual({});
  });

  it('returns traceId and spanId from the active span when one is present', () => {
    const spanContext: SpanContext = {
      traceId: '0af7651916cd43dd8448eb211c80319c',
      spanId: 'b7ad6b7169203331',
      traceFlags: 1,
    };

    const fakeSpan = {
      spanContext: () => spanContext,
    } as unknown as Span;

    const activeContext = trace.setSpan(context.active(), fakeSpan);

    context.with(activeContext, () => {
      const result = getTraceContext();
      expect(result).toEqual({
        traceId: spanContext.traceId,
        spanId: spanContext.spanId,
      });
    });
  });

  it('reflects updated span context values from spanContext()', () => {
    const spanContext: SpanContext = {
      traceId: 'ffffffffffffffffffffffffffffffff',
      spanId: '1111111111111111',
      traceFlags: 0,
    };
    const fakeSpan = { spanContext: () => spanContext } as unknown as Span;
    const activeContext = trace.setSpan(context.active(), fakeSpan);

    context.with(activeContext, () => {
      expect(getTraceContext()).toEqual({
        traceId: 'ffffffffffffffffffffffffffffffff',
        spanId: '1111111111111111',
      });
    });

    // Outside the `with` callback, the previous (empty) context is restored.
    expect(getTraceContext()).toEqual({});
  });
});
