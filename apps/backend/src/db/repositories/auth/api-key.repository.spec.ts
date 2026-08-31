import { DBService } from '@db/db.service';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';

import { ApiKeyRepository } from './api-key.repository';

/**
 * Drizzle query builders are "thenable" — calling `await` at any point in the
 * chain resolves to the final query result. This helper builds a mock chain
 * object where every fluent method returns itself, and `then` resolves with
 * the provided result, regardless of how many methods were chained before it.
 */
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

describe('ApiKeyRepository', () => {
  let target: ApiKeyRepository;
  let dbMock: {
    select: jest.Mock;
    update: jest.Mock;
    insert: jest.Mock;
  };

  beforeEach(async () => {
    dbMock = {
      select: jest.fn(),
      update: jest.fn(),
      insert: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [ApiKeyRepository, { provide: DBService, useValue: { db: dbMock } }],
    }).compile();

    target = module.get(ApiKeyRepository);
  });

  afterEach(() => jest.clearAllMocks());

  describe('createApiKey', () => {
    it('inserts a new api key and returns its generated id', async () => {
      dbMock.insert.mockReturnValue(createQueryBuilder([{ id: 'key-1' }]));

      const result = await target.createApiKey({
        userId: 'user-1',
        name: 'CI key',
        keyHash: 'hash',
        prefix: 'pfx',
        scopes: ['read'],
      });

      expect(result).toBe('key-1');
      expect(dbMock.insert).toHaveBeenCalled();
    });

    it('throws when the insert returns no rows', async () => {
      dbMock.insert.mockReturnValue(createQueryBuilder([]));

      await expect(
        target.createApiKey({
          userId: 'user-1',
          name: 'CI key',
          keyHash: 'hash',
          prefix: 'pfx',
          scopes: ['read'],
        })
      ).rejects.toThrow('Failed to create API key');
    });
  });

  describe('findActiveKeysByPrefix', () => {
    it('returns matching active keys for the prefix', async () => {
      const rows = [{ id: 'key-1', userId: 'user-1', keyHash: 'hash', expiresAt: null }];
      dbMock.select.mockReturnValue(createQueryBuilder(rows));

      const result = await target.findActiveKeysByPrefix('pfx');

      expect(result).toEqual(rows);
    });

    it('returns an empty array when no keys match', async () => {
      dbMock.select.mockReturnValue(createQueryBuilder([]));

      const result = await target.findActiveKeysByPrefix('missing');

      expect(result).toEqual([]);
    });
  });

  describe('updateLastUsed', () => {
    it('updates the lastUsedAt timestamp for the given key', async () => {
      const builder = createQueryBuilder(undefined);
      dbMock.update.mockReturnValue(builder);

      await target.updateLastUsed('key-1');

      expect(dbMock.update).toHaveBeenCalled();
      expect(builder['set']).toHaveBeenCalledWith(
        expect.objectContaining({ lastUsedAt: expect.any(Date) })
      );
    });
  });

  describe('findApiKeyById', () => {
    it('returns the key ownership info when found', async () => {
      dbMock.select.mockReturnValue(createQueryBuilder([{ id: 'key-1', userId: 'user-1' }]));

      const result = await target.findApiKeyById('key-1');

      expect(result).toEqual({ id: 'key-1', userId: 'user-1' });
    });

    it('returns null when the key does not exist', async () => {
      dbMock.select.mockReturnValue(createQueryBuilder([]));

      const result = await target.findApiKeyById('missing-key');

      expect(result).toBeNull();
    });
  });

  describe('revokeKey', () => {
    it('sets the revokedAt timestamp on the key', async () => {
      const builder = createQueryBuilder(undefined);
      dbMock.update.mockReturnValue(builder);

      await target.revokeKey('key-1');

      expect(builder['set']).toHaveBeenCalledWith(
        expect.objectContaining({ revokedAt: expect.any(Date) })
      );
    });
  });

  describe('findKeysByUserId', () => {
    it('lists all keys for a user', async () => {
      const rows = [
        {
          id: 'key-1',
          name: 'CI key',
          prefix: 'pfx',
          scopes: ['read'],
          lastUsedAt: null,
          expiresAt: null,
          revokedAt: null,
          createdAt: new Date('2024-01-01T00:00:00.000Z'),
        },
      ];
      dbMock.select.mockReturnValue(createQueryBuilder(rows));

      const result = await target.findKeysByUserId('user-1');

      expect(result).toEqual(rows);
    });

    it('returns an empty array when the user has no keys', async () => {
      dbMock.select.mockReturnValue(createQueryBuilder([]));

      const result = await target.findKeysByUserId('user-1');

      expect(result).toEqual([]);
    });
  });

  describe('findUserWithRolesAndPermissions', () => {
    it('returns null when the user is not found', async () => {
      dbMock.select.mockReturnValueOnce(createQueryBuilder([]));

      const result = await target.findUserWithRolesAndPermissions('missing-user');

      expect(result).toBeNull();
      expect(dbMock.select).toHaveBeenCalledTimes(1);
    });

    it('aggregates roles and de-duplicates permissions for the found user', async () => {
      dbMock.select
        .mockReturnValueOnce(createQueryBuilder([{ id: 'user-1', email: 'jane@example.com' }]))
        .mockReturnValueOnce(createQueryBuilder([{ roleName: 'admin' }, { roleName: 'user' }]))
        .mockReturnValueOnce(
          createQueryBuilder([
            { permissionName: 'users:read' },
            { permissionName: 'users:read' },
            { permissionName: 'users:write' },
          ])
        );

      const result = await target.findUserWithRolesAndPermissions('user-1');

      expect(result).toEqual({
        id: 'user-1',
        email: 'jane@example.com',
        roles: ['admin', 'user'],
        permissions: ['users:read', 'users:write'],
      });
    });
  });
});
