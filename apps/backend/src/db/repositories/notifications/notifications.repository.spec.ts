import { DBService } from '@db/db.service';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import type { SendNotificationOptions } from '@notifications/interfaces/notification.interface';

import { NotificationsRepository } from './notifications.repository';

/**
 * Builds a "thenable" drizzle-like query builder mock. Every chain method
 * (values/from/where/orderBy/limit/offset/set/onConflictDoUpdate/returning)
 * returns the same object so any chain depth works, and awaiting the object
 * resolves to `result` (mimicking drizzle's PromiseLike query builders).
 */
function chain<T>(result: T): T {
  const obj: Record<string, unknown> = {};
  const methods = [
    'values',
    'from',
    'where',
    'orderBy',
    'limit',
    'offset',
    'set',
    'onConflictDoUpdate',
    'returning',
  ];
  for (const method of methods) {
    obj[method] = jest.fn(() => obj);
  }
  obj['then'] = (resolve: (value: T) => unknown, reject?: (reason: unknown) => unknown): unknown =>
    Promise.resolve(result).then(resolve, reject);

  return obj as unknown as T;
}

describe('NotificationsRepository', () => {
  let target: NotificationsRepository;
  let dbMock: { insert: jest.Mock; select: jest.Mock; update: jest.Mock };

  const notificationRow = {
    id: 'notif-1',
    userId: 'user-1',
    title: 'Title',
    body: 'Body',
    type: 'message',
    data: {},
    channel: 'push',
    isRead: false,
    sentAt: new Date('2026-01-01T00:00:00Z'),
    readAt: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
  };

  beforeEach(async () => {
    dbMock = {
      insert: jest.fn(),
      select: jest.fn(),
      update: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [NotificationsRepository, { provide: DBService, useValue: { db: dbMock } }],
    }).compile();

    target = module.get(NotificationsRepository);
  });

  afterEach(() => jest.clearAllMocks());

  describe('create', () => {
    it('inserts a notification and returns the mapped record', async () => {
      dbMock.insert.mockReturnValue(chain([notificationRow]));

      const options: SendNotificationOptions = {
        userId: 'user-1',
        title: 'Title',
        body: 'Body',
        type: 'message',
        channel: 'push',
      };

      const result = await target.create(options);

      expect(dbMock.insert).toHaveBeenCalled();
      expect(result).toEqual({
        id: 'notif-1',
        userId: 'user-1',
        title: 'Title',
        body: 'Body',
        type: 'message',
        data: {},
        channel: 'push',
        isRead: false,
        sentAt: notificationRow.sentAt,
        readAt: null,
        createdAt: notificationRow.createdAt,
      });
    });

    it('throws when the insert returns no row', async () => {
      dbMock.insert.mockReturnValue(chain([]));

      await expect(
        target.create({
          userId: 'user-1',
          title: 'Title',
          body: 'Body',
          type: 'message',
          channel: 'push',
        })
      ).rejects.toThrow('Failed to create notification record');
    });
  });

  describe('findByUserId', () => {
    it('returns paginated data and total count', async () => {
      dbMock.select.mockImplementation((arg?: unknown) => {
        return arg ? chain([{ count: 2 }]) : chain([notificationRow, notificationRow]);
      });

      const result = await target.findByUserId('user-1', 1, 20);

      expect(result.total).toBe(2);
      expect(result.data).toHaveLength(2);
      expect(result.data[0]?.id).toBe('notif-1');
    });

    it('defaults total to 0 when count query returns no rows', async () => {
      dbMock.select.mockImplementation((arg?: unknown) => (arg ? chain([]) : chain([])));

      const result = await target.findByUserId('user-1', 1, 20);

      expect(result.total).toBe(0);
      expect(result.data).toEqual([]);
    });
  });

  describe('findById', () => {
    it('returns the mapped record when found', async () => {
      dbMock.select.mockReturnValue(chain([notificationRow]));

      const result = await target.findById('notif-1');

      expect(result?.id).toBe('notif-1');
    });

    it('returns null when not found', async () => {
      dbMock.select.mockReturnValue(chain([]));

      const result = await target.findById('missing');

      expect(result).toBeNull();
    });
  });

  describe('markAsRead', () => {
    it('returns the mapped record when the update matches a row', async () => {
      dbMock.update.mockReturnValue(chain([{ ...notificationRow, isRead: true }]));

      const result = await target.markAsRead('notif-1', 'user-1');

      expect(result?.isRead).toBe(true);
    });

    it('returns null when no matching notification is updated', async () => {
      dbMock.update.mockReturnValue(chain([]));

      const result = await target.markAsRead('missing', 'user-1');

      expect(result).toBeNull();
    });
  });

  describe('markAllAsRead', () => {
    it('returns the number of updated rows', async () => {
      dbMock.update.mockReturnValue(chain([{ id: '1' }, { id: '2' }, { id: '3' }]));

      const result = await target.markAllAsRead('user-1');

      expect(result).toBe(3);
    });

    it('returns 0 when nothing was updated', async () => {
      dbMock.update.mockReturnValue(chain([]));

      const result = await target.markAllAsRead('user-1');

      expect(result).toBe(0);
    });
  });

  describe('getUnreadCount', () => {
    it('returns the unread count', async () => {
      dbMock.select.mockReturnValue(chain([{ count: 5 }]));

      const result = await target.getUnreadCount('user-1');

      expect(result).toBe(5);
    });

    it('returns 0 when no result row is returned', async () => {
      dbMock.select.mockReturnValue(chain([]));

      const result = await target.getUnreadCount('user-1');

      expect(result).toBe(0);
    });
  });

  describe('findDeviceFids', () => {
    it('returns active device FIDs for the user', async () => {
      const fids = [
        {
          id: 'dt-1',
          userId: 'user-1',
          fid: 'fid-abc',
          platform: 'ios',
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];
      dbMock.select.mockReturnValue(chain(fids));

      const result = await target.findDeviceFids('user-1');

      expect(result).toEqual(fids);
    });

    it('returns an empty array when there are no active FIDs', async () => {
      dbMock.select.mockReturnValue(chain([]));

      const result = await target.findDeviceFids('user-1');

      expect(result).toEqual([]);
    });
  });

  describe('registerDeviceFid', () => {
    it('inserts/upserts the device FID and returns the row', async () => {
      const fidRow = {
        id: 'dt-1',
        userId: 'user-1',
        fid: 'fid-abc',
        platform: 'ios',
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      dbMock.insert.mockReturnValue(chain([fidRow]));

      const result = await target.registerDeviceFid('user-1', 'fid-abc', 'ios');

      expect(result).toEqual(fidRow);
    });

    it('throws when the upsert returns no row', async () => {
      dbMock.insert.mockReturnValue(chain([]));

      await expect(target.registerDeviceFid('user-1', 'fid-abc', 'ios')).rejects.toThrow(
        'Failed to register device FID'
      );
    });
  });

  describe('deactivateDeviceFid', () => {
    it('resolves without error', async () => {
      // eslint-disable-next-line @typescript-eslint/no-confusing-void-expression -- chain<T>(undefined) infers T=undefined to model a no-op Drizzle update result
      dbMock.update.mockReturnValue(chain(undefined));

      await expect(target.deactivateDeviceFid('fid-abc')).resolves.toBeUndefined();
      expect(dbMock.update).toHaveBeenCalled();
    });
  });
});
