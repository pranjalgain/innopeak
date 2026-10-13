import { OperationTimeoutError, withTimeout } from './with-timeout';

describe('withTimeout', () => {
  afterEach(() => jest.useRealTimers());

  it('returns the result when the operation answers in time', async () => {
    await expect(withTimeout(Promise.resolve('pong'), 1_000, 'redis')).resolves.toBe('pong');
  });

  it("passes the operation's own failure through", async () => {
    await expect(withTimeout(Promise.reject(new Error('NOAUTH')), 1_000, 'redis')).rejects.toThrow(
      'NOAUTH'
    );
  });

  // Regression: a dead Redis connection made ioredis wait forever, so health probes and the rate limiter hung with it.
  it('gives up on an operation that never answers', async () => {
    jest.useFakeTimers();
    const pending = withTimeout(new Promise(() => undefined), 500, 'redis ping');
    const assertion = expect(pending).rejects.toBeInstanceOf(OperationTimeoutError);

    await jest.advanceTimersByTimeAsync(500);

    await assertion;
    await expect(pending).rejects.toThrow('redis ping did not answer within 500 ms');
  });

  it('does not leave a timer running after a fast answer', async () => {
    jest.useFakeTimers();

    await withTimeout(Promise.resolve(1), 10_000, 'x');

    expect(jest.getTimerCount()).toBe(0);
  });
});
