import type { ConfigService } from '@nestjs/config';

const createLoggerMock = jest.fn();
const winstonLogger = { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() };

jest.mock('winston', () => {
  const actual = jest.requireActual('winston');
  return {
    ...actual,
    createLogger: (...args: unknown[]) => {
      createLoggerMock(...args);
      return winstonLogger;
    },
  };
});

import { LoggerService } from './logger.service';

const configFor = (env: string | undefined): ConfigService<never> =>
  ({ get: jest.fn(() => env) }) as unknown as ConfigService<never>;

describe('LoggerService', () => {
  beforeEach(() => jest.clearAllMocks());

  it('logs at warn in production and debug elsewhere', () => {
    new LoggerService(configFor('production'));
    new LoggerService(configFor('development'));

    expect(createLoggerMock).toHaveBeenNthCalledWith(1, expect.objectContaining({ level: 'warn' }));
    expect(createLoggerMock).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ level: 'debug' })
    );
  });

  // Logs go to stdout for the platform to collect; the app writes no files and ships nothing to a log backend.
  it('writes to the console only', () => {
    new LoggerService(configFor('production'));

    const options = createLoggerMock.mock.calls[0]?.[0] as { transports: unknown[] };
    expect(options.transports).toHaveLength(1);
  });

  it('maps each method to the matching level and carries the context', () => {
    const target = new LoggerService(configFor('development'));

    target.error('boom', 'stack', 'Ctx');
    target.warn('careful', 'Ctx');
    target.log('fine', 'Ctx');
    target.debug('detail', 'Ctx');
    target.http('GET /x');

    expect(winstonLogger.error).toHaveBeenCalledWith({
      message: 'boom',
      trace: 'stack',
      context: 'Ctx',
    });
    expect(winstonLogger.warn).toHaveBeenCalledWith({ message: 'careful', context: 'Ctx' });
    expect(winstonLogger.info).toHaveBeenCalledWith({ message: 'fine', context: 'Ctx' });
    expect(winstonLogger.debug).toHaveBeenCalledWith({ message: 'detail', context: 'Ctx' });
    expect(winstonLogger.info).toHaveBeenCalledWith({ message: 'GET /x', context: 'HTTP' });
  });
});
