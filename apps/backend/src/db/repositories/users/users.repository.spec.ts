import { DBService } from '@db/db.service';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';

import { UsersRepository } from './users.repository';

/**
 * Drizzle query builders are "thenable" — calling `await` on any point in the
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

describe('UsersRepository', () => {
  let target: UsersRepository;
  let dbMock: {
    select: jest.Mock;
    update: jest.Mock;
    insert: jest.Mock;
    delete: jest.Mock;
  };

  const findByIdRow = {
    id: 'user-1',
    email: 'jane@example.com',
    firstName: 'Jane',
    lastName: 'Doe',
    phone: null,
    isActive: true,
    isEmailVerified: true,
    mfaEnabled: false,
    createdAt: new Date('2024-01-01T00:00:00.000Z'),
    roleName: 'user',
  };

  beforeEach(async () => {
    dbMock = {
      select: jest.fn(),
      update: jest.fn(),
      insert: jest.fn(),
      delete: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersRepository,
        {
          provide: DBService,
          useValue: { db: dbMock },
        },
      ],
    }).compile();

    target = module.get(UsersRepository);
  });

  afterEach(() => jest.clearAllMocks());

  describe('findById', () => {
    it('returns a mapped user profile with aggregated roles when found', async () => {
      dbMock.select.mockReturnValue(createQueryBuilder([findByIdRow]));

      const result = await target.findById('user-1');

      expect(result).toEqual({
        id: 'user-1',
        email: 'jane@example.com',
        firstName: 'Jane',
        lastName: 'Doe',
        phone: null,
        isActive: true,
        isEmailVerified: true,
        mfaEnabled: false,
        roles: ['user'],
        createdAt: findByIdRow.createdAt,
      });
    });

    it('returns null when no rows are found', async () => {
      dbMock.select.mockReturnValue(createQueryBuilder([]));

      const result = await target.findById('missing-user');

      expect(result).toBeNull();
    });

    it('collapses multiple joined rows (multiple roles) into a single profile with all role names', async () => {
      dbMock.select.mockReturnValue(
        createQueryBuilder([
          findByIdRow,
          { ...findByIdRow, roleName: 'admin' },
          { ...findByIdRow, roleName: null },
        ])
      );

      const result = await target.findById('user-1');

      expect(result?.roles).toEqual(['user', 'admin']);
    });
  });

  describe('findByEmail', () => {
    it('returns a mapped user profile when found', async () => {
      dbMock.select.mockReturnValue(createQueryBuilder([findByIdRow]));

      const result = await target.findByEmail('jane@example.com');

      expect(result?.email).toBe('jane@example.com');
    });

    it('returns null when no user matches the email', async () => {
      dbMock.select.mockReturnValue(createQueryBuilder([]));

      const result = await target.findByEmail('missing@example.com');

      expect(result).toBeNull();
    });
  });

  describe('findAll', () => {
    const userRow = {
      id: 'user-1',
      email: 'jane@example.com',
      firstName: 'Jane',
      lastName: 'Doe',
      phone: null,
      isActive: true,
      isEmailVerified: true,
      mfaEnabled: false,
      createdAt: new Date('2024-01-01T00:00:00.000Z'),
    };

    it('returns paginated users with roles grouped by userId', async () => {
      dbMock.select
        .mockReturnValueOnce(createQueryBuilder([{ count: 1 }]))
        .mockReturnValueOnce(createQueryBuilder([userRow]))
        .mockReturnValueOnce(createQueryBuilder([{ userId: 'user-1', roleName: 'admin' }]));

      const result = await target.findAll(1, 20);

      expect(result.total).toBe(1);
      expect(result.data).toEqual([{ ...userRow, roles: ['admin'] }]);
    });

    it('returns an empty page without querying roles when there are no users', async () => {
      dbMock.select
        .mockReturnValueOnce(createQueryBuilder([{ count: 0 }]))
        .mockReturnValueOnce(createQueryBuilder([]));

      const result = await target.findAll(1, 20);

      expect(result).toEqual({ data: [], total: 0 });
      expect(dbMock.select).toHaveBeenCalledTimes(2);
    });

    it('defaults total to 0 when the count query returns no rows', async () => {
      dbMock.select
        .mockReturnValueOnce(createQueryBuilder([]))
        .mockReturnValueOnce(createQueryBuilder([]));

      const result = await target.findAll(1, 20);

      expect(result.total).toBe(0);
    });
  });

  describe('update', () => {
    it('updates the user and returns the refreshed profile', async () => {
      dbMock.update.mockReturnValue(createQueryBuilder([{ id: 'user-1' }]));
      dbMock.select.mockReturnValue(createQueryBuilder([findByIdRow]));

      const result = await target.update('user-1', { firstName: 'Janet' });

      expect(result?.firstName).toBe('Jane');
      expect(dbMock.update).toHaveBeenCalled();
    });

    it('returns null when no matching user row was updated', async () => {
      dbMock.update.mockReturnValue(createQueryBuilder([]));

      const result = await target.update('missing-user', { firstName: 'Janet' });

      expect(result).toBeNull();
      expect(dbMock.select).not.toHaveBeenCalled();
    });
  });

  describe('softDelete', () => {
    it('issues an update marking the user as deleted and inactive', async () => {
      const builder = createQueryBuilder(undefined);
      dbMock.update.mockReturnValue(builder);

      await target.softDelete('user-1');

      expect(dbMock.update).toHaveBeenCalled();
      expect(builder['set']).toHaveBeenCalledWith(expect.objectContaining({ isActive: false }));
    });
  });
});
