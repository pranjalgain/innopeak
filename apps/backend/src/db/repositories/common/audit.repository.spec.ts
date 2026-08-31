import { DBService } from '@db/db.service';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';

import { AuditRepository } from './audit.repository';

function createQueryBuilder(result: unknown): PromiseLike<unknown> & Record<string, jest.Mock> {
  const methodNames = [
    'from',
    'leftJoin',
    'innerJoin',
    'where',
    'orderBy',
    'limit',
    'offset',
    'set',
    'values',
    'returning',
  ];

  const builder: Record<string, jest.Mock> & { then?: unknown } = {};

  for (const name of methodNames) {
    builder[name] = jest.fn(() => builder);
  }

  builder.then = (
    onFulfilled?: (value: unknown) => unknown,
    onRejected?: (reason: unknown) => unknown
  ) => Promise.resolve(result).then(onFulfilled, onRejected);

  return builder as PromiseLike<unknown> & Record<string, jest.Mock>;
}

describe('AuditRepository', () => {
  let target: AuditRepository;
  let dbMock: {
    select: jest.Mock;
    insert: jest.Mock;
  };

  beforeEach(async () => {
    dbMock = {
      select: jest.fn(),
      insert: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [AuditRepository, { provide: DBService, useValue: { db: dbMock } }],
    }).compile();

    target = module.get(AuditRepository);
  });

  afterEach(() => jest.clearAllMocks());

  describe('create', () => {
    it('inserts an audit log record and defaults optional fields to null', async () => {
      const builder = createQueryBuilder(undefined);
      dbMock.insert.mockReturnValue(builder);

      await target.create({
        requestedApi: '/v1/users',
        operationType: 'VIEW',
        severity: 'LOW',
        description: 'Viewed user list',
      });

      expect(builder['values']).toHaveBeenCalledWith({
        requestedApi: '/v1/users',
        operationType: 'VIEW',
        severity: 'LOW',
        description: 'Viewed user list',
        ipAddress: null,
        userAgent: null,
        hostName: null,
      });
    });

    it('prefixes the description with the userId and stores it in hostName when provided', async () => {
      const builder = createQueryBuilder(undefined);
      dbMock.insert.mockReturnValue(builder);

      await target.create({
        requestedApi: '/v1/users/1',
        operationType: 'DELETE',
        severity: 'CRITICAL',
        description: 'Deleted user',
        ipAddress: '127.0.0.1',
        userAgent: 'jest-agent',
        userId: 'user-1',
      });

      expect(builder['values']).toHaveBeenCalledWith({
        requestedApi: '/v1/users/1',
        operationType: 'DELETE',
        severity: 'CRITICAL',
        description: '[userId=user-1] Deleted user',
        ipAddress: '127.0.0.1',
        userAgent: 'jest-agent',
        hostName: 'user-1',
      });
    });
  });

  describe('findByApi', () => {
    it('returns paginated rows and the total count', async () => {
      const rows = [{ id: 'log-1', requestedApi: '/v1/users' }];
      dbMock.select
        .mockReturnValueOnce(createQueryBuilder([{ count: 2 }]))
        .mockReturnValueOnce(createQueryBuilder(rows));

      const result = await target.findByApi('/v1/users', 1, 20);

      expect(result).toEqual({ data: rows, total: 2 });
      expect(dbMock.select).toHaveBeenCalledTimes(2);
    });

    it('defaults total to 0 when the count query returns no rows', async () => {
      dbMock.select
        .mockReturnValueOnce(createQueryBuilder([]))
        .mockReturnValueOnce(createQueryBuilder([]));

      const result = await target.findByApi('/v1/users', 1, 20);

      expect(result).toEqual({ data: [], total: 0 });
    });

    it('computes the correct offset for later pages', async () => {
      const rowsBuilder = createQueryBuilder([]);
      dbMock.select
        .mockReturnValueOnce(createQueryBuilder([{ count: 0 }]))
        .mockReturnValueOnce(rowsBuilder);

      await target.findByApi('/v1/users', 3, 10);

      expect(rowsBuilder['offset']).toHaveBeenCalledWith(20);
      expect(rowsBuilder['limit']).toHaveBeenCalledWith(10);
    });
  });
});
