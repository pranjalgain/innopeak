/** Rejected when `withTimeout` gives up waiting. */
export class OperationTimeoutError extends Error {
  constructor(label: string, timeoutMs: number) {
    super(`${label} did not answer within ${timeoutMs} ms`);
    this.name = 'OperationTimeoutError';
  }
}

/**
 * Races `operation` against a timer. The shared Redis client is configured to wait indefinitely for a dead connection (BullMQ needs
 * that), so anything on the request path that must never hang (a health probe, the rate limiter) bounds its own wait with this. The
 * underlying operation is not cancelled; it is simply no longer waited for.
 */
export async function withTimeout<T>(
  operation: Promise<T>,
  timeoutMs: number,
  label: string
): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      reject(new OperationTimeoutError(label, timeoutMs));
    }, timeoutMs);
  });

  try {
    return await Promise.race([operation, timeout]);
  } finally {
    clearTimeout(timer);
  }
}
