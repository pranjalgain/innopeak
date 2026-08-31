import type { Span, SpanContext } from '@opentelemetry/api';
import { context, trace } from '@opentelemetry/api';

export function getTraceContext(): { traceId?: string; spanId?: string } {
  const activeSpan: Span | undefined = trace.getSpan(context.active());

  if (activeSpan) {
    const spanContext: SpanContext = activeSpan.spanContext();
    return {
      traceId: spanContext.traceId,
      spanId: spanContext.spanId,
    };
  }

  return {};
}
