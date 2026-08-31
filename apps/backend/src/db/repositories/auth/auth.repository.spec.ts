import { DBService } from '@db/db.service';
import { NotFoundException } from '@nestjs/common';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';

import { AuthRepository } from './auth.repository';

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

describe('AuthRepository', () => {
  let target: AuthRepository;
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
      providers: [AuthRepository, { provide: DBService, useValue: { db: dbMock } }],
    }).compile();

    target = module.get(AuthRepository);
  });

  afterEach(() => jest.clearAllMocks());

  describe('findUserByEmail', () => {
    it('returns the matching user when found', async () => {
      const row = { id: 'user-1', email: 'jane@example.com', passwordHash: 'hash', isActive: true };
      dbMock.select.mockReturnValue(createQueryBuilder([row]));

      const result = await target.findUserByEmail('jane@example.com');

      expect(result).toEqual(row);
    });

    it('returns null when no user matches the email', async () => {
      dbMock.select.mockReturnValue(createQueryBuilder([]));

      const result = await target.findUserByEmail('missing@example.com');

      expect(result).toBeNull();
    });
  });

  describe('createUser', () => {
    it('inserts a new user and returns the generated id', async () => {
      dbMock.insert.mockReturnValue(createQueryBuilder([{ id: 'user-1' }]));

      const result = await target.createUser({
        email: 'jane@example.com',
        passwordHash: 'hash',
        firstName: 'Jane',
        lastName: 'Doe',
      });

      expect(result).toBe('user-1');
    });

    it('defaults optional name fields to null', async () => {
      const builder = createQueryBuilder([{ id: 'user-1' }]);
      dbMock.insert.mockReturnValue(builder);

      await target.createUser({ email: 'jane@example.com', passwordHash: 'hash' });

      expect(builder['values']).toHaveBeenCalledWith(
        expect.objectContaining({ firstName: null, lastName: null, isActive: true })
      );
    });

    it('throws when the insert returns no rows', async () => {
      dbMock.insert.mockReturnValue(createQueryBuilder([]));

      await expect(
        target.createUser({ email: 'jane@example.com', passwordHash: 'hash' })
      ).rejects.toThrow('Failed to create user');
    });
  });

  describe('assignRole', () => {
    it('inserts a user-role link when the role exists', async () => {
      dbMock.select.mockReturnValue(createQueryBuilder([{ id: 'role-1' }]));
      const insertBuilder = createQueryBuilder(undefined);
      dbMock.insert.mockReturnValue(insertBuilder);

      await target.assignRole('user-1', 'admin');

      expect(insertBuilder['values']).toHaveBeenCalledWith({ userId: 'user-1', roleId: 'role-1' });
    });

    it('does nothing when the role does not exist', async () => {
      dbMock.select.mockReturnValue(createQueryBuilder([]));

      await target.assignRole('user-1', 'missing-role');

      expect(dbMock.insert).not.toHaveBeenCalled();
    });
  });

  describe('getUserWithRolesAndPermissions', () => {
    it('throws NotFoundException when the user does not exist', async () => {
      dbMock.select.mockReturnValueOnce(createQueryBuilder([]));

      await expect(target.getUserWithRolesAndPermissions('missing-user')).rejects.toThrow(
        NotFoundException
      );
    });

    it('returns the aggregated user with roles and de-duplicated permissions', async () => {
      dbMock.select
        .mockReturnValueOnce(createQueryBuilder([{ id: 'user-1', email: 'jane@example.com' }]))
        .mockReturnValueOnce(createQueryBuilder([{ roleName: 'user' }]))
        .mockReturnValueOnce(
          createQueryBuilder([{ permissionName: 'users:read' }, { permissionName: 'users:read' }])
        );

      const result = await target.getUserWithRolesAndPermissions('user-1');

      expect(result).toEqual({
        id: 'user-1',
        email: 'jane@example.com',
        roles: ['user'],
        permissions: ['users:read'],
      });
    });
  });

  describe('updateUserPassword', () => {
    it('updates the password hash and updatedAt timestamp', async () => {
      const builder = createQueryBuilder(undefined);
      dbMock.update.mockReturnValue(builder);

      await target.updateUserPassword('user-1', 'new-hash');

      expect(builder['set']).toHaveBeenCalledWith(
        expect.objectContaining({ passwordHash: 'new-hash', updatedAt: expect.any(Date) })
      );
    });
  });

  describe('findUserById', () => {
    it('returns the user id and password hash when found', async () => {
      dbMock.select.mockReturnValue(createQueryBuilder([{ id: 'user-1', passwordHash: 'hash' }]));

      const result = await target.findUserById('user-1');

      expect(result).toEqual({ id: 'user-1', passwordHash: 'hash' });
    });

    it('returns null when the user is not found', async () => {
      dbMock.select.mockReturnValue(createQueryBuilder([]));

      const result = await target.findUserById('missing-user');

      expect(result).toBeNull();
    });
  });
});
