import { TtlCache } from './ttl-cache';

describe('TtlCache', () => {
  let clock: number;
  const now = (): number => clock;

  beforeEach(() => {
    clock = 1_000;
  });

  it('loads once and serves the cached value until it expires', async () => {
    const cache = new TtlCache<number>(60_000, 10, now);
    const load = jest.fn().mockResolvedValueOnce(1).mockResolvedValueOnce(2);

    expect(await cache.getOrLoad('k', load)).toBe(1);
    clock += 59_999;
    expect(await cache.getOrLoad('k', load)).toBe(1);
    expect(load).toHaveBeenCalledTimes(1);

    clock += 2;
    expect(await cache.getOrLoad('k', load)).toBe(2);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('keeps keys apart', async () => {
    const cache = new TtlCache<string>(60_000, 10, now);

    expect(await cache.getOrLoad('a', () => Promise.resolve('A'))).toBe('A');
    expect(await cache.getOrLoad('b', () => Promise.resolve('B'))).toBe('B');
  });

  it('shares one load between concurrent misses', async () => {
    const cache = new TtlCache<number>(60_000, 10, now);
    let release: (value: number) => void = () => undefined;
    const load = jest.fn(
      () =>
        new Promise<number>(resolve => {
          release = resolve;
        })
    );

    const first = cache.getOrLoad('k', load);
    const second = cache.getOrLoad('k', load);
    release(7);

    expect(await Promise.all([first, second])).toEqual([7, 7]);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('never caches a failed load', async () => {
    const cache = new TtlCache<number>(60_000, 10, now);
    const load = jest.fn().mockRejectedValueOnce(new Error('db down')).mockResolvedValueOnce(5);

    await expect(cache.getOrLoad('k', load)).rejects.toThrow('db down');
    expect(await cache.getOrLoad('k', load)).toBe(5);
  });

  it('evicts the oldest entry past its size cap', async () => {
    const cache = new TtlCache<number>(60_000, 2, now);
    const load = jest.fn((value: number) => Promise.resolve(value));

    await cache.getOrLoad('a', () => load(1));
    await cache.getOrLoad('b', () => load(2));
    await cache.getOrLoad('c', () => load(3));
    await cache.getOrLoad('a', () => load(1));

    expect(load).toHaveBeenCalledTimes(4);
  });
});
