import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';

import { buildPoolConfig, DBService } from './db.service';

const mockPoolClient = {
  release: jest.fn(),
};

const mockPoolInstance = {
  on: jest.fn(),
  connect: jest.fn(),
  end: jest.fn(),
  query: jest.fn(),
};

jest.mock('pg', () => ({
  Pool: jest.fn().mockImplementation(() => mockPoolInstance),
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { Pool } = require('pg') as { Pool: jest.Mock };

describe('DBService', () => {
  let target: DBService;
  let configService: { get: jest.Mock };

  beforeEach(async () => {
    jest.clearAllMocks();
    mockPoolClient.release.mockReset();
    mockPoolInstance.connect.mockReset().mockResolvedValue(mockPoolClient);
    mockPoolInstance.end.mockReset().mockResolvedValue(undefined);
    mockPoolInstance.query.mockReset().mockResolvedValue({ rows: [] });

    configService = {
      get: jest.fn((key: string) => {
        if (key === 'DATABASE_URL') return 'postgres://user:pass@localhost:5432/test';
        return undefined;
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [DBService, { provide: ConfigService, useValue: configService }],
    }).compile();

    target = module.get(DBService);
  });

  afterEach(() => jest.clearAllMocks());

  describe('constructor', () => {
    it('reads DATABASE_URL from config and constructs a pg Pool with production-sane limits', () => {
      expect(configService.get).toHaveBeenCalledWith('DATABASE_URL');
      expect(Pool).toHaveBeenCalledWith({
        connectionString: 'postgres://user:pass@localhost:5432/test',
        max: 10,
        idleTimeoutMillis: 30_000,
        connectionTimeoutMillis: 5_000,
        statement_timeout: 30_000,
        application_name: 'innopeak',
      });
    });

    it('falls back to an empty connection string when DATABASE_URL is undefined', async () => {
      const emptyConfig = { get: jest.fn().mockReturnValue(undefined) };

      const module: TestingModule = await Test.createTestingModule({
        providers: [DBService, { provide: ConfigService, useValue: emptyConfig }],
      }).compile();
      module.get(DBService);

      expect(Pool).toHaveBeenLastCalledWith(expect.objectContaining({ connectionString: '' }));
    });

    // Regression guard: an unhandled `error` event on the pool (an idle connection dropped by the server) kills the process.
    it('listens for idle-connection errors instead of letting them crash the process', () => {
      const errorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation();
      const listener = mockPoolInstance.on.mock.calls.find(call => call[0] === 'error')?.[1] as (
        error: Error
      ) => void;

      expect(listener).toBeDefined();
      expect(() => {
        listener(new Error('terminating connection'));
      }).not.toThrow();
      expect(errorSpy).toHaveBeenCalledWith(
        'Idle database connection failed: terminating connection'
      );
    });
  });

  describe('buildPoolConfig', () => {
    const configWith = (values: Record<string, unknown>) =>
      ({ get: (key: string) => values[key] }) as unknown as ConfigService<never>;

    it('takes the pool limits from the environment', () => {
      expect(
        buildPoolConfig(
          configWith({
            DATABASE_URL: 'postgres://x',
            DB_POOL_MAX: 25,
            DB_IDLE_TIMEOUT_MS: 10_000,
            DB_CONNECTION_TIMEOUT_MS: 2_000,
            DB_STATEMENT_TIMEOUT_MS: 15_000,
          })
        )
      ).toMatchObject({
        max: 25,
        idleTimeoutMillis: 10_000,
        connectionTimeoutMillis: 2_000,
        statement_timeout: 15_000,
      });
    });

    it('does not enable TLS unless asked, and verifies the certificate when it does', () => {
      expect(buildPoolConfig(configWith({ DATABASE_URL: 'postgres://x' }))).not.toHaveProperty(
        'ssl'
      );
      expect(
        buildPoolConfig(configWith({ DATABASE_URL: 'postgres://x', DB_SSL: 'true' })).ssl
      ).toEqual({
        rejectUnauthorized: true,
      });
    });

    it('relaxes certificate verification only when explicitly told to', () => {
      expect(
        buildPoolConfig(
          configWith({
            DATABASE_URL: 'postgres://x',
            DB_SSL: 'true',
            DB_SSL_REJECT_UNAUTHORIZED: 'false',
          })
        ).ssl
      ).toEqual({ rejectUnauthorized: false });
    });
  });

  describe('db getter', () => {
    it('is undefined before onModuleInit has run', () => {
      expect(target.db).toBeUndefined();
    });

    it('returns the drizzle instance after onModuleInit succeeds', async () => {
      jest.spyOn(Logger.prototype, 'log').mockImplementation();

      await target.onModuleInit();

      expect(target.db).toBeDefined();
    });
  });

  describe('onModuleInit', () => {
    it('checks out and releases a connection to confirm connectivity, sets up drizzle, and logs success', async () => {
      const logSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation();

      await target.onModuleInit();

      expect(mockPoolInstance.connect).toHaveBeenCalledTimes(1);
      expect(mockPoolClient.release).toHaveBeenCalledTimes(1);
      expect(logSpy).toHaveBeenCalledWith('Database connected successfully');
    });

    // Regression: a failed connection was only logged, so the app booted "healthy" and then threw a TypeError on every query.
    it('logs the error and fails the boot when the connection fails', async () => {
      const errorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation();
      mockPoolInstance.connect.mockRejectedValue(new Error('connection refused'));

      await expect(target.onModuleInit()).rejects.toThrow('connection refused');

      expect(errorSpy).toHaveBeenCalledWith('Database connection failed:', 'connection refused');
      expect(target.db).toBeUndefined();
    });
  });

  describe('onModuleDestroy', () => {
    it('ends the pool and logs success', async () => {
      const logSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation();

      await target.onModuleDestroy();

      expect(mockPoolInstance.end).toHaveBeenCalledTimes(1);
      expect(logSpy).toHaveBeenCalledWith('Database connection closed');
    });

    it('logs an error and does not throw when ending the connection fails', async () => {
      const errorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation();
      mockPoolInstance.end.mockRejectedValue(new Error('already closed'));

      await expect(target.onModuleDestroy()).resolves.toBeUndefined();

      expect(errorSpy).toHaveBeenCalledWith('Error disconnecting from database:', 'already closed');
    });
  });

  describe('isHealthy', () => {
    it('returns true when the health check query succeeds', async () => {
      mockPoolInstance.query.mockResolvedValue({ rows: [{ '?column?': 1 }] });

      await expect(target.isHealthy()).resolves.toBe(true);
      expect(mockPoolInstance.query).toHaveBeenCalledWith('SELECT 1');
    });

    it('returns false when the health check query throws', async () => {
      mockPoolInstance.query.mockRejectedValue(new Error('connection lost'));

      await expect(target.isHealthy()).resolves.toBe(false);
    });
  });
});
