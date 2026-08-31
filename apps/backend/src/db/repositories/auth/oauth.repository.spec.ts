import { DBService } from '@db/db.service';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';

import { OAuthRepository } from './oauth.repository';

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

describe('OAuthRepository', () => {
  let target: OAuthRepository;
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
      providers: [OAuthRepository, { provide: DBService, useValue: { db: dbMock } }],
    }).compile();

    target = module.get(OAuthRepository);
  });

  afterEach(() => jest.clearAllMocks());

  describe('findOAuthAccount', () => {
    it('returns the account id and userId when found', async () => {
      dbMock.select.mockReturnValue(createQueryBuilder([{ id: 'acct-1', userId: 'user-1' }]));

      const result = await target.findOAuthAccount('google', 'google-uid');

      expect(result).toEqual({ id: 'acct-1', userId: 'user-1' });
    });

    it('returns null when no account matches the provider/providerId pair', async () => {
      dbMock.select.mockReturnValue(createQueryBuilder([]));

      const result = await target.findOAuthAccount('google', 'missing-uid');

      expect(result).toBeNull();
    });
  });

  describe('updateOAuthTokens', () => {
    it('updates access and refresh tokens on the account', async () => {
      const builder = createQueryBuilder(undefined);
      dbMock.update.mockReturnValue(builder);

      await target.updateOAuthTokens('acct-1', 'access-token', 'refresh-token');

      expect(builder['set']).toHaveBeenCalledWith(
        expect.objectContaining({
          accessTokenEncrypted: 'access-token',
          refreshTokenEncrypted: 'refresh-token',
          updatedAt: expect.any(Date),
        })
      );
    });

    it('allows setting tokens to null', async () => {
      const builder = createQueryBuilder(undefined);
      dbMock.update.mockReturnValue(builder);

      await target.updateOAuthTokens('acct-1', null, null);

      expect(builder['set']).toHaveBeenCalledWith(
        expect.objectContaining({ accessTokenEncrypted: null, refreshTokenEncrypted: null })
      );
    });
  });

  describe('findUserByEmail', () => {
    it('returns the user id when found', async () => {
      dbMock.select.mockReturnValue(createQueryBuilder([{ id: 'user-1' }]));

      const result = await target.findUserByEmail('jane@example.com');

      expect(result).toEqual({ id: 'user-1' });
    });

    it('returns null when no user matches the email', async () => {
      dbMock.select.mockReturnValue(createQueryBuilder([]));

      const result = await target.findUserByEmail('missing@example.com');

      expect(result).toBeNull();
    });
  });

  describe('createUser', () => {
    it('creates a new user from oauth profile data and returns the id', async () => {
      const builder = createQueryBuilder([{ id: 'user-1' }]);
      dbMock.insert.mockReturnValue(builder);

      const result = await target.createUser({
        email: 'jane@example.com',
        firstName: 'Jane',
        lastName: 'Doe',
      });

      expect(result).toBe('user-1');
      expect(builder['values']).toHaveBeenCalledWith(
        expect.objectContaining({ isEmailVerified: true, isActive: true })
      );
    });

    it('throws when the insert returns no rows', async () => {
      dbMock.insert.mockReturnValue(createQueryBuilder([]));

      await expect(
        target.createUser({ email: 'jane@example.com', firstName: null, lastName: null })
      ).rejects.toThrow('Failed to create user');
    });
  });

  describe('assignDefaultRole', () => {
    it('links the user to the default "user" role when it exists', async () => {
      dbMock.select.mockReturnValue(createQueryBuilder([{ id: 'role-1' }]));
      const insertBuilder = createQueryBuilder(undefined);
      dbMock.insert.mockReturnValue(insertBuilder);

      await target.assignDefaultRole('user-1');

      expect(insertBuilder['values']).toHaveBeenCalledWith({ userId: 'user-1', roleId: 'role-1' });
    });

    it('does nothing when the default role does not exist', async () => {
      dbMock.select.mockReturnValue(createQueryBuilder([]));

      await target.assignDefaultRole('user-1');

      expect(dbMock.insert).not.toHaveBeenCalled();
    });
  });

  describe('createOAuthAccount', () => {
    it('inserts a new oauth account record linked to the user', async () => {
      const builder = createQueryBuilder(undefined);
      dbMock.insert.mockReturnValue(builder);

      await target.createOAuthAccount({
        userId: 'user-1',
        provider: 'google',
        providerUserId: 'google-uid',
        accessToken: 'access',
        refreshToken: 'refresh',
      });

      expect(builder['values']).toHaveBeenCalledWith({
        userId: 'user-1',
        provider: 'google',
        providerUserId: 'google-uid',
        accessTokenEncrypted: 'access',
        refreshTokenEncrypted: 'refresh',
      });
    });
  });

  describe('loadUserWithRolesAndPermissions', () => {
    it('throws an error when the user is not found', async () => {
      dbMock.select.mockReturnValueOnce(createQueryBuilder([]));

      await expect(target.loadUserWithRolesAndPermissions('missing-user')).rejects.toThrow(
        'User not found'
      );
    });

    it('returns the aggregated user with roles and de-duplicated permissions', async () => {
      dbMock.select
        .mockReturnValueOnce(createQueryBuilder([{ id: 'user-1', email: 'jane@example.com' }]))
        .mockReturnValueOnce(createQueryBuilder([{ roleName: 'admin' }]))
        .mockReturnValueOnce(
          createQueryBuilder([{ permissionName: 'users:write' }, { permissionName: 'users:write' }])
        );

      const result = await target.loadUserWithRolesAndPermissions('user-1');

      expect(result).toEqual({
        id: 'user-1',
        email: 'jane@example.com',
        roles: ['admin'],
        permissions: ['users:write'],
      });
    });
  });
});
