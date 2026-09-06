import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';

import { DBService } from './db.service';

const mockPoolClient = {
  release: jest.fn(),
};

const mockPoolInstance = {
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
      get: jest.fn().mockReturnValue('postgres://user:pass@localhost:5432/test'),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [DBService, { provide: ConfigService, useValue: configService }],
    }).compile();

    target = module.get(DBService);
  });

  afterEach(() => jest.clearAllMocks());

  describe('constructor', () => {
    it('reads DATABASE_URL from config and constructs a pg Pool with it', () => {
      expect(configService.get).toHaveBeenCalledWith('DATABASE_URL');
      expect(Pool).toHaveBeenCalledWith({
        connectionString: 'postgres://user:pass@localhost:5432/test',
      });
    });

    it('falls back to an empty connection string when DATABASE_URL is undefined', async () => {
      const emptyConfig = { get: jest.fn().mockReturnValue(undefined) };

      const module: TestingModule = await Test.createTestingModule({
        providers: [DBService, { provide: ConfigService, useValue: emptyConfig }],
      }).compile();
      module.get(DBService);

      expect(Pool).toHaveBeenCalledWith({ connectionString: '' });
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

    it('logs an error and does not throw when the connection fails', async () => {
      const errorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation();
      mockPoolInstance.connect.mockRejectedValue(new Error('connection refused'));

      await expect(target.onModuleInit()).resolves.toBeUndefined();

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
