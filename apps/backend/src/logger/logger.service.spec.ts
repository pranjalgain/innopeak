import type { EnvConfig } from '@config/env.config';
import type { Logger as NestLoggerType } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';

import type { LoggerService as LoggerServiceType } from './logger.service';

interface WinstonLoggerMock {
  error: jest.Mock;
  warn: jest.Mock;
  info: jest.Mock;
  debug: jest.Mock;
  on: jest.Mock;
}

interface BreakerMock {
  action: (...args: unknown[]) => unknown;
  fire: jest.Mock;
  on: jest.Mock;
}

describe('LoggerService', () => {
  let winstonLoggerMock: WinstonLoggerMock;
  let createLoggerMock: jest.Mock;
  let printfMock: jest.Mock;
  let combineMock: jest.Mock;
  let consoleTransportMock: jest.Mock;
  let dailyRotateFileMock: jest.Mock;
  let breakerCtorMock: jest.Mock;
  let breakerInstance: BreakerMock | undefined;
  let processOnSpy: jest.SpyInstance;
  let processExitSpy: jest.SpyInstance;
  let nestLoggerLogSpy: jest.SpyInstance;
  let nestLoggerWarnSpy: jest.SpyInstance;
  let nestLoggerErrorSpy: jest.SpyInstance;
  let fetchMock: jest.Mock;

  /**
   * Fresh-requires the module under test (and its dependencies) after resetting
   * the module registry. This is required because LoggerService keeps a
   * `static sigtermListenerAdded` flag on the class itself, so re-requiring the
   * module gives every test a clean class definition with the flag reset.
   */
  function loadLoggerService(): {
    LoggerService: typeof LoggerServiceType;
  } {
    jest.resetModules();

    winstonLoggerMock = {
      error: jest.fn(),
      warn: jest.fn(),
      info: jest.fn(),
      debug: jest.fn(),
      on: jest.fn(),
    };
    createLoggerMock = jest.fn(() => winstonLoggerMock);
    printfMock = jest.fn((fn: unknown) => fn);
    combineMock = jest.fn((...args: unknown[]) => args);
    consoleTransportMock = jest.fn();
    dailyRotateFileMock = jest.fn();
    breakerInstance = undefined;
    breakerCtorMock = jest.fn().mockImplementation((action: (...args: unknown[]) => unknown) => {
      breakerInstance = {
        action,
        fire: jest.fn((...args: unknown[]) => action(...args)),
        on: jest.fn(),
      };
      return breakerInstance;
    });

    jest.doMock('winston', () => ({
      createLogger: createLoggerMock,
      format: {
        printf: printfMock,
        combine: combineMock,
        timestamp: jest.fn(() => 'TIMESTAMP_FORMAT'),
        colorize: jest.fn(() => 'COLORIZE_FORMAT'),
      },
      transports: {
        Console: consoleTransportMock,
      },
    }));
    jest.doMock('winston-daily-rotate-file', () => dailyRotateFileMock);
    jest.doMock('opossum', () => breakerCtorMock);

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const nestCommon = require('@nestjs/common') as { Logger: typeof NestLoggerType };
    nestLoggerLogSpy = jest.spyOn(nestCommon.Logger, 'log').mockImplementation(() => undefined);
    nestLoggerWarnSpy = jest.spyOn(nestCommon.Logger, 'warn').mockImplementation(() => undefined);
    nestLoggerErrorSpy = jest.spyOn(nestCommon.Logger, 'error').mockImplementation(() => undefined);

    processOnSpy = jest.spyOn(process, 'on');
    processExitSpy = jest.spyOn(process, 'exit').mockImplementation(() => undefined as never);

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('./logger.service') as { LoggerService: typeof LoggerServiceType };
    return { LoggerService: mod.LoggerService };
  }

  function makeConfigService(
    values: Partial<Record<'LOKI_API_TOKEN' | 'LOKI_PORT' | 'NODE_ENV', string>>
  ): ConfigService<EnvConfig> {
    return {
      get: jest.fn((key: string) => values[key as keyof typeof values]),
    } as unknown as ConfigService<EnvConfig>;
  }

  beforeEach(() => {
    fetchMock = jest.fn();
    (global as unknown as { fetch: jest.Mock }).fetch = fetchMock;
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
    jest.clearAllMocks();
    jest.dontMock('winston');
    jest.dontMock('winston-daily-rotate-file');
    jest.dontMock('opossum');
  });

  describe('production mode (Loki logging disabled)', () => {
    it('logs the disabled message and skips flusher/breaker/SIGTERM setup', () => {
      const { LoggerService } = loadLoggerService();
      const configService = makeConfigService({ NODE_ENV: 'production' });

      new LoggerService(configService);

      expect(createLoggerMock).toHaveBeenCalledWith(expect.objectContaining({ level: 'warn' }));
      expect(nestLoggerLogSpy).toHaveBeenCalledWith(
        '🚀 Loki logging is disabled in production mode'
      );
      expect(breakerCtorMock).not.toHaveBeenCalled();
      expect(processOnSpy).not.toHaveBeenCalledWith('SIGTERM', expect.any(Function));
      expect(nestLoggerWarnSpy).not.toHaveBeenCalled();
      expect(nestLoggerErrorSpy).not.toHaveBeenCalled();
      expect(processExitSpy).not.toHaveBeenCalled();
    });
  });

  describe('development mode setup', () => {
    it('creates a debug-level logger, registers the data listener, breaker and SIGTERM handler', () => {
      const { LoggerService } = loadLoggerService();
      const configService = makeConfigService({
        NODE_ENV: 'development',
        LOKI_API_TOKEN: 'secret-token',
        LOKI_PORT: '3100',
      });

      new LoggerService(configService);

      expect(createLoggerMock).toHaveBeenCalledWith(expect.objectContaining({ level: 'debug' }));
      expect(winstonLoggerMock.on).toHaveBeenCalledWith('data', expect.any(Function));
      expect(processOnSpy).toHaveBeenCalledWith('SIGTERM', expect.any(Function));
      expect(breakerCtorMock).toHaveBeenCalledWith(expect.any(Function), {
        timeout: 5000,
        errorThresholdPercentage: 50,
        resetTimeout: 10000,
      });
      expect(breakerInstance?.on).toHaveBeenCalledWith('open', expect.any(Function));
      expect(breakerInstance?.on).toHaveBeenCalledWith('halfOpen', expect.any(Function));
      expect(breakerInstance?.on).toHaveBeenCalledWith('close', expect.any(Function));
    });

    it('emits circuit breaker lifecycle logs via the Nest static Logger', () => {
      const { LoggerService } = loadLoggerService();
      const configService = makeConfigService({ NODE_ENV: 'development' });

      new LoggerService(configService);

      const openHandler = breakerInstance?.on.mock.calls.find(call => call[0] === 'open')?.[1];
      const halfOpenHandler = breakerInstance?.on.mock.calls.find(
        call => call[0] === 'halfOpen'
      )?.[1];
      const closeHandler = breakerInstance?.on.mock.calls.find(call => call[0] === 'close')?.[1];

      openHandler();
      halfOpenHandler();
      closeHandler();

      expect(nestLoggerWarnSpy).toHaveBeenCalledWith(
        'Circuit breaker opened for sendBatchToPromtail'
      );
      expect(nestLoggerLogSpy).toHaveBeenCalledWith(
        'Circuit breaker is half-open, trying to send logs again'
      );
      expect(nestLoggerLogSpy).toHaveBeenCalledWith(
        'Circuit breaker closed, normal operation resumed'
      );
    });

    it('adds the SIGTERM listener only once even if multiple instances are constructed', () => {
      const { LoggerService } = loadLoggerService();
      const configService = makeConfigService({ NODE_ENV: 'development' });

      new LoggerService(configService);
      new LoggerService(configService);

      const sigtermCalls = processOnSpy.mock.calls.filter(call => call[0] === 'SIGTERM');
      expect(sigtermCalls).toHaveLength(1);
    });
  });

  describe('log queue batching', () => {
    it('pushes emitted winston log records onto the queue and flushes them via the breaker on interval', async () => {
      const { LoggerService } = loadLoggerService();
      const configService = makeConfigService({
        NODE_ENV: 'development',
        LOKI_API_TOKEN: 'tok',
        LOKI_PORT: '3100',
      });

      new LoggerService(configService);

      const dataHandler = winstonLoggerMock.on.mock.calls.find(call => call[0] === 'data')?.[1] as (
        log: unknown
      ) => void;
      expect(dataHandler).toBeDefined();

      dataHandler({ message: 'first log' });
      dataHandler({ message: 'second log' });

      // Nothing should be flushed before the interval elapses.
      expect(breakerInstance?.fire).not.toHaveBeenCalled();

      fetchMock.mockResolvedValueOnce({ ok: true });

      await jest.advanceTimersByTimeAsync(5000);

      expect(breakerInstance?.fire).toHaveBeenCalledWith('tok');
      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toBe('http://127.0.0.1:3100/loki/api/v1/push');
      expect(options.headers).toMatchObject({ Authorization: 'Bearer tok' });
      const body = JSON.parse(options.body as string) as {
        streams: [{ values: [string, string][] }];
      };
      expect(body.streams[0].values).toHaveLength(2);
      expect(body.streams[0].values.map(([, message]) => message)).toEqual([
        'first log',
        'second log',
      ]);
    });

    it('does not fire the breaker when the queue is empty', async () => {
      const { LoggerService } = loadLoggerService();
      const configService = makeConfigService({ NODE_ENV: 'development' });

      new LoggerService(configService);

      await jest.advanceTimersByTimeAsync(5000);

      expect(breakerInstance?.fire).not.toHaveBeenCalled();
    });

    it('re-queues logs and surfaces the failure through the circuit-breaker catch handler (Error instance)', async () => {
      const { LoggerService } = loadLoggerService();
      const configService = makeConfigService({
        NODE_ENV: 'development',
        LOKI_API_TOKEN: 'tok',
      });

      new LoggerService(configService);

      const dataHandler = winstonLoggerMock.on.mock.calls.find(call => call[0] === 'data')?.[1] as (
        log: unknown
      ) => void;
      dataHandler({ message: 'will fail' });

      fetchMock.mockResolvedValueOnce({ ok: false, status: 500 });

      await jest.advanceTimersByTimeAsync(5000);
      // allow the rejected breaker.fire() promise chain to settle
      await Promise.resolve();
      await Promise.resolve();

      expect(nestLoggerErrorSpy).toHaveBeenCalledWith(
        'Failed to send batch logs to Promtail:',
        'HTTP error! status: 500'
      );
      expect(nestLoggerErrorSpy).toHaveBeenCalledWith(
        'Circuit breaker prevented sending logs:',
        'HTTP error! status: 500'
      );

      // The failed batch should have been re-queued: the next flush should resend it
      // together with anything queued afterwards.
      fetchMock.mockResolvedValueOnce({ ok: true });
      dataHandler({ message: 'newly queued' });

      await jest.advanceTimersByTimeAsync(5000);
      await Promise.resolve();

      const secondCallOptions = fetchMock.mock.calls[1]?.[1] as RequestInit;
      const secondBody = JSON.parse(secondCallOptions.body as string) as {
        streams: [{ values: [string, string][] }];
      };
      expect(secondBody.streams[0].values.map(([, message]) => message)).toEqual([
        'will fail',
        'newly queued',
      ]);
    });

    it('narrows non-Error rejections from the breaker via String(error) in the catch handler', async () => {
      const { LoggerService } = loadLoggerService();
      const configService = makeConfigService({ NODE_ENV: 'development' });

      new LoggerService(configService);

      const dataHandler = winstonLoggerMock.on.mock.calls.find(call => call[0] === 'data')?.[1] as (
        log: unknown
      ) => void;
      dataHandler({ message: 'queued' });

      // Bypass the real sendBatchToPromtail action and reject with a non-Error value
      // to exercise the `String(error)` branch of the instanceof-narrowed catch handler.
      (breakerInstance as BreakerMock).fire = jest.fn().mockRejectedValue('plain-string-failure');

      await jest.advanceTimersByTimeAsync(5000);
      await Promise.resolve();
      await Promise.resolve();

      expect(nestLoggerErrorSpy).toHaveBeenCalledWith(
        'Circuit breaker prevented sending logs:',
        'plain-string-failure'
      );
    });
  });

  describe('SIGTERM graceful shutdown', () => {
    it('flushes any queued logs before exiting the process', async () => {
      const { LoggerService } = loadLoggerService();
      const configService = makeConfigService({
        NODE_ENV: 'development',
        LOKI_API_TOKEN: 'tok',
      });

      new LoggerService(configService);

      const dataHandler = winstonLoggerMock.on.mock.calls.find(call => call[0] === 'data')?.[1] as (
        log: unknown
      ) => void;
      dataHandler({ message: 'pending log' });

      fetchMock.mockResolvedValueOnce({ ok: true });

      const sigtermHandler = processOnSpy.mock.calls.find(call => call[0] === 'SIGTERM')?.[1] as (
        ...args: unknown[]
      ) => void;
      expect(sigtermHandler).toBeDefined();

      sigtermHandler();

      // process.exit must not be called synchronously - the flush is awaited first.
      expect(processExitSpy).not.toHaveBeenCalled();

      // Let the SIGTERM IIFE's internal awaits (fetch + response handling) settle.
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();

      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(processExitSpy).toHaveBeenCalledWith(0);
    });
  });

  describe('logFormat printf formatter', () => {
    function extractLogFormatFn(): (info: {
      timestamp?: unknown;
      level: string;
      message?: unknown;
      context?: unknown;
    }) => string {
      const formatArg = createLoggerMock.mock.calls[0]?.[0] as { format: unknown[] };
      // format = format.combine(format.timestamp(...), logFormat) -> combineMock returns args array
      const logFormatFn = formatArg.format[1] as (info: {
        timestamp?: unknown;
        level: string;
        message?: unknown;
        context?: unknown;
      }) => string;
      expect(typeof logFormatFn).toBe('function');
      return logFormatFn;
    }

    it('formats string timestamp/context/message directly', () => {
      const { LoggerService } = loadLoggerService();
      new LoggerService(makeConfigService({ NODE_ENV: 'production' }));

      const logFormatFn = extractLogFormatFn();
      const result = logFormatFn({
        timestamp: '2024-01-01 00:00:00',
        level: 'info',
        message: 'hello world',
        context: 'AppModule',
      });

      expect(result).toBe('2024-01-01 00:00:00 [info] [AppModule]: hello world');
    });

    it('falls back to JSON.stringify and default context for non-string fields', () => {
      const { LoggerService } = loadLoggerService();
      new LoggerService(makeConfigService({ NODE_ENV: 'production' }));

      const logFormatFn = extractLogFormatFn();
      const result = logFormatFn({
        timestamp: 12345,
        level: 'warn',
        message: { foo: 'bar' },
        context: 42,
      });

      expect(result).toBe('12345 [warn] [App]: {"foo":"bar"}');
    });
  });

  describe('public logging methods', () => {
    it('delegates error() to the winston logger with trace/context and trace-id prefix', () => {
      const { LoggerService } = loadLoggerService();
      const target = new LoggerService(makeConfigService({ NODE_ENV: 'production' }));

      target.error('Something failed', 'stack-trace', 'CtxA', 'trace-1', 'span-1');

      expect(winstonLoggerMock.error).toHaveBeenCalledWith({
        message: '[TraceId=trace-1 | SpanId=span-1] Something failed',
        trace: 'stack-trace',
        context: 'CtxA',
      });
    });

    it('delegates warn()/log()/debug() without a trace prefix when no traceId is supplied', () => {
      const { LoggerService } = loadLoggerService();
      const target = new LoggerService(makeConfigService({ NODE_ENV: 'production' }));

      target.warn('careful', 'CtxB');
      target.log('all good', 'CtxC');
      target.debug('debugging', 'CtxD');

      expect(winstonLoggerMock.warn).toHaveBeenCalledWith({ message: 'careful', context: 'CtxB' });
      expect(winstonLoggerMock.info).toHaveBeenCalledWith({ message: 'all good', context: 'CtxC' });
      expect(winstonLoggerMock.debug).toHaveBeenCalledWith({
        message: 'debugging',
        context: 'CtxD',
      });
    });

    it('defaults http() context to "HTTP" when none is provided', () => {
      const { LoggerService } = loadLoggerService();
      const target = new LoggerService(makeConfigService({ NODE_ENV: 'production' }));

      target.http('GET /users 200');

      expect(winstonLoggerMock.info).toHaveBeenCalledWith({
        message: 'GET /users 200',
        context: 'HTTP',
      });
    });
  });
});
