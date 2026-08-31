import { DBService } from '@db/db.service';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';

import { TokenRepository } from './token.repository';

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

describe('TokenRepository', () => {
  let target: TokenRepository;
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
      providers: [TokenRepository, { provide: DBService, useValue: { db: dbMock } }],
    }).compile();

    target = module.get(TokenRepository);
  });

  afterEach(() => jest.clearAllMocks());

  describe('storeRefreshToken', () => {
    it('inserts a hashed refresh token record', async () => {
      const builder = createQueryBuilder(undefined);
      dbMock.insert.mockReturnValue(builder);
      const expiresAt = new Date('2024-06-01T00:00:00.000Z');

      await target.storeRefreshToken('user-1', 'token-hash', expiresAt);

      expect(builder['values']).toHaveBeenCalledWith({
        userId: 'user-1',
        tokenHash: 'token-hash',
        expiresAt,
      });
    });
  });

  describe('findActiveTokensByUserId', () => {
    it('returns active (non-revoked) tokens for the user', async () => {
      const rows = [{ id: 'token-1', tokenHash: 'hash-1' }];
      dbMock.select.mockReturnValue(createQueryBuilder(rows));

      const result = await target.findActiveTokensByUserId('user-1');

      expect(result).toEqual(rows);
    });

    it('returns an empty array when the user has no active tokens', async () => {
      dbMock.select.mockReturnValue(createQueryBuilder([]));

      const result = await target.findActiveTokensByUserId('user-1');

      expect(result).toEqual([]);
    });
  });

  describe('revokeToken', () => {
    it('sets the revokedAt timestamp on the token', async () => {
      const builder = createQueryBuilder(undefined);
      dbMock.update.mockReturnValue(builder);

      await target.revokeToken('token-1');

      expect(builder['set']).toHaveBeenCalledWith(
        expect.objectContaining({ revokedAt: expect.any(Date) })
      );
    });
  });

  describe('revokeAllUserTokens', () => {
    it('revokes all active tokens belonging to the user', async () => {
      const builder = createQueryBuilder(undefined);
      dbMock.update.mockReturnValue(builder);

      await target.revokeAllUserTokens('user-1');

      expect(dbMock.update).toHaveBeenCalled();
      expect(builder['set']).toHaveBeenCalledWith(
        expect.objectContaining({ revokedAt: expect.any(Date) })
      );
    });
  });

  describe('findUserWithRolesAndPermissions', () => {
    it('returns null when the user is not found', async () => {
      dbMock.select.mockReturnValueOnce(createQueryBuilder([]));

      const result = await target.findUserWithRolesAndPermissions('missing-user');

      expect(result).toBeNull();
      expect(dbMock.select).toHaveBeenCalledTimes(1);
    });

    it('returns the aggregated user with roles and de-duplicated permissions', async () => {
      dbMock.select
        .mockReturnValueOnce(createQueryBuilder([{ id: 'user-1', email: 'jane@example.com' }]))
        .mockReturnValueOnce(createQueryBuilder([{ roleName: 'moderator' }]))
        .mockReturnValueOnce(
          createQueryBuilder([{ permissionName: 'posts:read' }, { permissionName: 'posts:read' }])
        );

      const result = await target.findUserWithRolesAndPermissions('user-1');

      expect(result).toEqual({
        id: 'user-1',
        email: 'jane@example.com',
        roles: ['moderator'],
        permissions: ['posts:read'],
      });
    });
  });
});
