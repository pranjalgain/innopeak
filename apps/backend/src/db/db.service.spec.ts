import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';

import { DBService } from './db.service';

const mockClientInstance = {
  connect: jest.fn(),
  end: jest.fn(),
  query: jest.fn(),
  on: jest.fn(),
};

jest.mock('pg', () => ({
  Client: jest.fn().mockImplementation(() => mockClientInstance),
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { Client } = require('pg') as { Client: jest.Mock };

describe('DBService', () => {
  let target: DBService;
  let configService: { get: jest.Mock };

  beforeEach(async () => {
    jest.clearAllMocks();
    mockClientInstance.connect.mockReset().mockResolvedValue(undefined);
    mockClientInstance.end.mockReset().mockResolvedValue(undefined);
    mockClientInstance.query.mockReset().mockResolvedValue({ rows: [] });
    mockClientInstance.on.mockReset();

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
    it('reads DATABASE_URL from config and constructs a pg Client with it', () => {
      expect(configService.get).toHaveBeenCalledWith('DATABASE_URL');
      expect(Client).toHaveBeenCalledWith({
        connectionString: 'postgres://user:pass@localhost:5432/test',
      });
    });

    it('falls back to an empty connection string when DATABASE_URL is undefined', async () => {
      const emptyConfig = { get: jest.fn().mockReturnValue(undefined) };

      const module: TestingModule = await Test.createTestingModule({
        providers: [DBService, { provide: ConfigService, useValue: emptyConfig }],
      }).compile();
      module.get(DBService);

      expect(Client).toHaveBeenCalledWith({ connectionString: '' });
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
    it('connects the client, sets up the drizzle db and logs success', async () => {
      const logSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation();

      await target.onModuleInit();

      expect(mockClientInstance.connect).toHaveBeenCalledTimes(1);
      expect(logSpy).toHaveBeenCalledWith('Database connected successfully');
      expect(mockClientInstance.query).toHaveBeenCalledWith('LISTEN password_updates');
    });

    it('registers a notification listener that logs on the password_updates channel', async () => {
      jest.spyOn(Logger.prototype, 'log').mockImplementation();
      const debugSpy = jest.spyOn(Logger.prototype, 'debug').mockImplementation();

      await target.onModuleInit();

      expect(mockClientInstance.on).toHaveBeenCalledWith('notification', expect.any(Function));
      const notificationHandler = mockClientInstance.on.mock.calls[0]?.[1] as (msg: {
        channel: string;
      }) => void;

      const logSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation();
      notificationHandler({ channel: 'password_updates' });

      expect(debugSpy).toHaveBeenCalledWith('Received notification on channel: password_updates');
      expect(logSpy).toHaveBeenCalledWith('Received password update notification');
    });

    it('does not log the password update message for other channels', async () => {
      jest.spyOn(Logger.prototype, 'log').mockImplementation();
      const debugSpy = jest.spyOn(Logger.prototype, 'debug').mockImplementation();

      await target.onModuleInit();

      const notificationHandler = mockClientInstance.on.mock.calls[0]?.[1] as (msg: {
        channel: string;
      }) => void;

      const logSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation();
      notificationHandler({ channel: 'other_channel' });

      expect(debugSpy).toHaveBeenCalledWith('Received notification on channel: other_channel');
      expect(logSpy).not.toHaveBeenCalledWith('Received password update notification');
    });

    it('logs an error and does not throw when the connection fails', async () => {
      const errorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation();
      mockClientInstance.connect.mockRejectedValue(new Error('connection refused'));

      await expect(target.onModuleInit()).resolves.toBeUndefined();

      expect(errorSpy).toHaveBeenCalledWith('Database connection failed:', 'connection refused');
      expect(target.db).toBeUndefined();
    });
  });

  describe('onModuleDestroy', () => {
    it('ends the client connection and logs success', async () => {
      const logSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation();

      await target.onModuleDestroy();

      expect(mockClientInstance.end).toHaveBeenCalledTimes(1);
      expect(logSpy).toHaveBeenCalledWith('Database connection closed');
    });

    it('logs an error and does not throw when ending the connection fails', async () => {
      const errorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation();
      mockClientInstance.end.mockRejectedValue(new Error('already closed'));

      await expect(target.onModuleDestroy()).resolves.toBeUndefined();

      expect(errorSpy).toHaveBeenCalledWith('Error disconnecting from database:', 'already closed');
    });
  });

  describe('isHealthy', () => {
    it('returns true when the health check query succeeds', async () => {
      mockClientInstance.query.mockResolvedValue({ rows: [{ '?column?': 1 }] });

      await expect(target.isHealthy()).resolves.toBe(true);
      expect(mockClientInstance.query).toHaveBeenCalledWith('SELECT 1');
    });

    it('returns false when the health check query throws', async () => {
      mockClientInstance.query.mockRejectedValue(new Error('connection lost'));

      await expect(target.isHealthy()).resolves.toBe(false);
    });
  });
});
