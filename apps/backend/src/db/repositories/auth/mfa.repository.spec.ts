import { DBService } from '@db/db.service';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';

import { MfaRepository } from './mfa.repository';

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

describe('MfaRepository', () => {
  let target: MfaRepository;
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
      providers: [MfaRepository, { provide: DBService, useValue: { db: dbMock } }],
    }).compile();

    target = module.get(MfaRepository);
  });

  afterEach(() => jest.clearAllMocks());

  describe('findUserById', () => {
    it('returns the user id and email when found', async () => {
      dbMock.select.mockReturnValue(
        createQueryBuilder([{ id: 'user-1', email: 'jane@example.com' }])
      );

      const result = await target.findUserById('user-1');

      expect(result).toEqual({ id: 'user-1', email: 'jane@example.com' });
    });

    it('returns null when the user is not found', async () => {
      dbMock.select.mockReturnValue(createQueryBuilder([]));

      const result = await target.findUserById('missing-user');

      expect(result).toBeNull();
    });
  });

  describe('findMfaSetting', () => {
    it('returns the mfa setting when found', async () => {
      const row = { id: 'mfa-1', secretEncrypted: 'enc', isVerified: true };
      dbMock.select.mockReturnValue(createQueryBuilder([row]));

      const result = await target.findMfaSetting('user-1', 'totp');

      expect(result).toEqual(row);
    });

    it('returns null when no setting exists for the given type', async () => {
      dbMock.select.mockReturnValue(createQueryBuilder([]));

      const result = await target.findMfaSetting('user-1', 'totp');

      expect(result).toBeNull();
    });
  });

  describe('upsertMfaSetting', () => {
    it('updates the existing setting and resets verification when one already exists', async () => {
      dbMock.select.mockReturnValue(
        createQueryBuilder([{ id: 'mfa-1', secretEncrypted: 'old', isVerified: true }])
      );
      const updateBuilder = createQueryBuilder(undefined);
      dbMock.update.mockReturnValue(updateBuilder);

      await target.upsertMfaSetting('user-1', 'totp', 'new-secret');

      expect(dbMock.update).toHaveBeenCalled();
      expect(updateBuilder['set']).toHaveBeenCalledWith(
        expect.objectContaining({
          secretEncrypted: 'new-secret',
          isVerified: false,
          updatedAt: expect.any(Date),
        })
      );
      expect(dbMock.insert).not.toHaveBeenCalled();
    });

    it('inserts a new setting when none exists yet', async () => {
      dbMock.select.mockReturnValue(createQueryBuilder([]));
      const insertBuilder = createQueryBuilder(undefined);
      dbMock.insert.mockReturnValue(insertBuilder);

      await target.upsertMfaSetting('user-1', 'totp', 'new-secret');

      expect(insertBuilder['values']).toHaveBeenCalledWith({
        userId: 'user-1',
        type: 'totp',
        secretEncrypted: 'new-secret',
        isVerified: false,
      });
      expect(dbMock.update).not.toHaveBeenCalled();
    });
  });

  describe('markMfaVerified', () => {
    it('marks the setting as verified', async () => {
      const builder = createQueryBuilder(undefined);
      dbMock.update.mockReturnValue(builder);

      await target.markMfaVerified('mfa-1');

      expect(builder['set']).toHaveBeenCalledWith(
        expect.objectContaining({ isVerified: true, updatedAt: expect.any(Date) })
      );
    });
  });

  describe('enableMfaOnUser', () => {
    it('enables mfa on the user record', async () => {
      const builder = createQueryBuilder(undefined);
      dbMock.update.mockReturnValue(builder);

      await target.enableMfaOnUser('user-1');

      expect(builder['set']).toHaveBeenCalledWith(
        expect.objectContaining({ mfaEnabled: true, updatedAt: expect.any(Date) })
      );
    });
  });

  describe('updateBackupCodes', () => {
    it('updates the hashed backup codes for the setting', async () => {
      const builder = createQueryBuilder(undefined);
      dbMock.update.mockReturnValue(builder);

      await target.updateBackupCodes('mfa-1', ['hash1', 'hash2']);

      expect(builder['set']).toHaveBeenCalledWith(
        expect.objectContaining({
          backupCodesHash: ['hash1', 'hash2'],
          updatedAt: expect.any(Date),
        })
      );
    });
  });
});
