import type { CallHandler, ExecutionContext } from '@nestjs/common';
import type { Cache } from 'cache-manager';
import { firstValueFrom, of } from 'rxjs';

import { ClientControlledCacheInterceptor } from './cache.interceptor';

describe('ClientControlledCacheInterceptor', () => {
  let interceptor: ClientControlledCacheInterceptor;
  let cacheManager: jest.Mocked<Cache>;

  const buildHttpContext = (headers: Record<string, string> = {}): ExecutionContext => {
    const request = {
      headers,
      method: 'GET',
      url: '/things/1',
      params: { id: '1' },
      query: { foo: 'bar' },
      body: {},
    };
    return {
      getType: () => 'http',
      switchToHttp: () => ({
        getRequest: () => request,
        getResponse: () => ({}),
      }),
      getHandler: jest.fn(),
      getClass: jest.fn(),
    } as unknown as ExecutionContext;
  };

  beforeEach(() => {
    cacheManager = {
      get: jest.fn(),
      set: jest.fn(),
      del: jest.fn(),
    } as unknown as jest.Mocked<Cache>;

    interceptor = new ClientControlledCacheInterceptor(cacheManager);
  });

  it('bypasses caching entirely when cache-control is no-store', async () => {
    const context = buildHttpContext({ 'cache-control': 'no-store' });
    const callHandler: CallHandler = { handle: () => of('fresh-response') };

    const result$ = await interceptor.intercept(context, callHandler);
    const result = await firstValueFrom(result$);

    expect(result).toBe('fresh-response');
    expect(cacheManager.get).not.toHaveBeenCalled();
    expect(cacheManager.set).not.toHaveBeenCalled();
  });

  it('returns the cached response on a cache hit without invoking the handler', async () => {
    const context = buildHttpContext({});
    cacheManager.get.mockResolvedValue({ cached: true });
    const handle = jest.fn(() => of('should-not-be-used'));
    const callHandler: CallHandler = { handle };

    const result$ = await interceptor.intercept(context, callHandler);
    const result = await firstValueFrom(result$);

    expect(result).toEqual({ cached: true });
    expect(cacheManager.get).toHaveBeenCalledTimes(1);
  });

  it('on a cache miss, calls the handler and stores the response with default TTL', async () => {
    const context = buildHttpContext({});
    cacheManager.get.mockResolvedValue(undefined);
    cacheManager.set.mockResolvedValue(undefined as never);
    const callHandler: CallHandler = { handle: () => of('fresh-data') };

    const result$ = await interceptor.intercept(context, callHandler);
    const result = await firstValueFrom(result$);

    expect(result).toBe('fresh-data');
    expect(cacheManager.set).toHaveBeenCalledWith(expect.any(String), 'fresh-data', 5 * 60 * 1000);
  });

  it('parses max-age from cache-control and uses it as TTL in milliseconds', async () => {
    const context = buildHttpContext({ 'cache-control': 'max-age=60' });
    cacheManager.get.mockResolvedValue(undefined);
    cacheManager.set.mockResolvedValue(undefined as never);
    const callHandler: CallHandler = { handle: () => of('fresh-data') };

    const result$ = await interceptor.intercept(context, callHandler);
    await firstValueFrom(result$);

    expect(cacheManager.set).toHaveBeenCalledWith(expect.any(String), 'fresh-data', 60 * 1000);
  });

  it('does not store the response in cache when cache-control is no-cache', async () => {
    const context = buildHttpContext({ 'cache-control': 'no-cache' });
    cacheManager.get.mockResolvedValue(undefined);
    const callHandler: CallHandler = { handle: () => of('fresh-data') };

    const result$ = await interceptor.intercept(context, callHandler);
    await firstValueFrom(result$);

    expect(cacheManager.set).not.toHaveBeenCalled();
  });

  it('logs (and swallows) an error when caching the response fails, without breaking the stream', async () => {
    const context = buildHttpContext({});
    cacheManager.get.mockResolvedValue(undefined);
    const setError = new Error('redis down');
    cacheManager.set.mockRejectedValue(setError);
    const callHandler: CallHandler = { handle: () => of('fresh-data') };

    const loggerErrorSpy = jest
      .spyOn((interceptor as unknown as { logger: { error: jest.Func } }).logger, 'error')
      .mockImplementation(() => undefined);

    const result$ = await interceptor.intercept(context, callHandler);
    const result = await firstValueFrom(result$);

    expect(result).toBe('fresh-data');

    // The cache.set call is fire-and-forget (`void ... .catch(...)`); flush microtasks
    // so the rejection has a chance to be handled before we assert on it.
    await new Promise(process.nextTick);

    expect(loggerErrorSpy).toHaveBeenCalledWith('Failed to store response in cache', setError);
  });

  it('reads cache-control from RPC context data when the context type is rpc', async () => {
    const rpcData = { cacheControl: 'no-store' };
    const context = {
      getType: () => 'rpc',
      switchToRpc: () => ({ getData: () => rpcData }),
      getHandler: jest.fn(),
      getClass: jest.fn(),
    } as unknown as ExecutionContext;
    const handle = jest.fn(() => of('rpc-response'));
    const callHandler: CallHandler = { handle };

    const result$ = await interceptor.intercept(context, callHandler);
    const result = await firstValueFrom(result$);

    expect(result).toBe('rpc-response');
    expect(cacheManager.get).not.toHaveBeenCalled();
  });

  it('reads cache-control from GraphQL context args when the context type is graphql', async () => {
    const gqlArgs = { cacheControl: 'no-store' };
    const context = {
      getType: () => 'graphql',
      getArgByIndex: () => gqlArgs,
      getHandler: jest.fn(),
      getClass: jest.fn(),
    } as unknown as ExecutionContext;
    const handle = jest.fn(() => of('gql-response'));
    const callHandler: CallHandler = { handle };

    const result$ = await interceptor.intercept(context, callHandler);
    const result = await firstValueFrom(result$);

    expect(result).toBe('gql-response');
    expect(cacheManager.get).not.toHaveBeenCalled();
  });
});
