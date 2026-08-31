import { DBService } from '@db/db.service';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';

import { WebhooksRepository } from './webhooks.repository';

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

describe('WebhooksRepository', () => {
  let target: WebhooksRepository;
  let dbMock: {
    select: jest.Mock;
    update: jest.Mock;
    insert: jest.Mock;
    delete: jest.Mock;
  };

  const webhookRow = {
    id: 'webhook-1',
    userId: 'user-1',
    url: 'https://example.com/webhooks/receive',
    secret: 'whsec_test',
    events: ['user.created'],
    isActive: true,
    description: null,
    createdAt: new Date('2024-01-01T00:00:00.000Z'),
    updatedAt: new Date('2024-01-01T00:00:00.000Z'),
  };

  const deliveryRow = {
    id: 'delivery-1',
    webhookId: 'webhook-1',
    event: 'user.created',
    payload: { foo: 'bar' },
    responseStatus: null,
    responseBody: null,
    attempt: 1,
    deliveredAt: null,
    nextRetryAt: null,
    status: 'pending',
    createdAt: new Date('2024-01-01T00:00:00.000Z'),
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
        WebhooksRepository,
        {
          provide: DBService,
          useValue: { db: dbMock },
        },
      ],
    }).compile();

    target = module.get(WebhooksRepository);
  });

  afterEach(() => jest.clearAllMocks());

  describe('createWebhook', () => {
    it('inserts a webhook without description when not provided and returns the mapped record', async () => {
      dbMock.insert.mockReturnValue(createQueryBuilder([webhookRow]));

      const result = await target.createWebhook({
        userId: 'user-1',
        url: webhookRow.url,
        secret: webhookRow.secret,
        events: webhookRow.events,
      });

      expect(result).toEqual(webhookRow);
      expect(dbMock.insert).toHaveBeenCalled();
    });

    it('includes description in the inserted values when provided', async () => {
      const builder = createQueryBuilder([{ ...webhookRow, description: 'Notify CRM' }]);
      dbMock.insert.mockReturnValue(builder);

      const result = await target.createWebhook({
        userId: 'user-1',
        url: webhookRow.url,
        secret: webhookRow.secret,
        events: webhookRow.events,
        description: 'Notify CRM',
      });

      expect(builder['values']).toHaveBeenCalledWith(
        expect.objectContaining({ description: 'Notify CRM' })
      );
      expect(result.description).toBe('Notify CRM');
    });

    it('throws an error when the insert returns no row', async () => {
      dbMock.insert.mockReturnValue(createQueryBuilder([]));

      await expect(
        target.createWebhook({
          userId: 'user-1',
          url: webhookRow.url,
          secret: webhookRow.secret,
          events: webhookRow.events,
        })
      ).rejects.toThrow('Failed to create webhook');
    });
  });

  describe('findByUserId', () => {
    it('returns all webhooks for the user mapped to records', async () => {
      dbMock.select.mockReturnValue(createQueryBuilder([webhookRow]));

      const result = await target.findByUserId('user-1');

      expect(result).toEqual([webhookRow]);
    });

    it('returns an empty array when the user has no webhooks', async () => {
      dbMock.select.mockReturnValue(createQueryBuilder([]));

      const result = await target.findByUserId('user-1');

      expect(result).toEqual([]);
    });
  });

  describe('findById', () => {
    it('returns the mapped webhook record when found', async () => {
      dbMock.select.mockReturnValue(createQueryBuilder([webhookRow]));

      const result = await target.findById('webhook-1');

      expect(result).toEqual(webhookRow);
    });

    it('returns null when no webhook is found', async () => {
      dbMock.select.mockReturnValue(createQueryBuilder([]));

      const result = await target.findById('missing');

      expect(result).toBeNull();
    });

    it('defaults events to an empty array when the column is null', async () => {
      dbMock.select.mockReturnValue(createQueryBuilder([{ ...webhookRow, events: null }]));

      const result = await target.findById('webhook-1');

      expect(result?.events).toEqual([]);
    });
  });

  describe('findByEvent', () => {
    it('returns active webhooks subscribed to the given event', async () => {
      dbMock.select.mockReturnValue(createQueryBuilder([webhookRow]));

      const result = await target.findByEvent('user.created');

      expect(result).toEqual([webhookRow]);
    });

    it('returns an empty array when no webhook subscribes to the event', async () => {
      dbMock.select.mockReturnValue(createQueryBuilder([]));

      const result = await target.findByEvent('order.completed');

      expect(result).toEqual([]);
    });
  });

  describe('updateWebhook', () => {
    it('applies only defined fields and returns the updated record', async () => {
      const builder = createQueryBuilder([{ ...webhookRow, url: 'https://new.example.com' }]);
      dbMock.update.mockReturnValue(builder);

      const result = await target.updateWebhook('webhook-1', 'user-1', {
        url: 'https://new.example.com',
      });

      expect(builder['set']).toHaveBeenCalledWith(
        expect.objectContaining({ url: 'https://new.example.com' })
      );
      expect(result?.url).toBe('https://new.example.com');
    });

    it('returns null when no row was updated (not found or not owned)', async () => {
      dbMock.update.mockReturnValue(createQueryBuilder([]));

      const result = await target.updateWebhook('webhook-1', 'user-1', { isActive: false });

      expect(result).toBeNull();
    });
  });

  describe('deleteWebhook', () => {
    it('returns true when a row was deleted', async () => {
      dbMock.delete.mockReturnValue(createQueryBuilder([{ id: 'webhook-1' }]));

      const result = await target.deleteWebhook('webhook-1', 'user-1');

      expect(result).toBe(true);
    });

    it('returns false when no row was deleted', async () => {
      dbMock.delete.mockReturnValue(createQueryBuilder([]));

      const result = await target.deleteWebhook('webhook-1', 'user-1');

      expect(result).toBe(false);
    });
  });

  describe('createDelivery', () => {
    it('inserts a delivery record and returns the mapped result', async () => {
      dbMock.insert.mockReturnValue(createQueryBuilder([deliveryRow]));

      const result = await target.createDelivery({
        webhookId: 'webhook-1',
        event: 'user.created',
        payload: { foo: 'bar' },
      });

      expect(result).toEqual(deliveryRow);
    });

    it('throws an error when the insert returns no row', async () => {
      dbMock.insert.mockReturnValue(createQueryBuilder([]));

      await expect(
        target.createDelivery({ webhookId: 'webhook-1', event: 'user.created', payload: {} })
      ).rejects.toThrow('Failed to create webhook delivery');
    });
  });

  describe('updateDeliveryStatus', () => {
    it('applies only defined fields and returns the updated delivery', async () => {
      const builder = createQueryBuilder([
        { ...deliveryRow, status: 'delivered', responseStatus: 200 },
      ]);
      dbMock.update.mockReturnValue(builder);

      const result = await target.updateDeliveryStatus('delivery-1', {
        status: 'delivered',
        responseStatus: 200,
      });

      expect(builder['set']).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'delivered', responseStatus: 200 })
      );
      expect(result?.status).toBe('delivered');
    });

    it('returns null when no delivery row was updated', async () => {
      dbMock.update.mockReturnValue(createQueryBuilder([]));

      const result = await target.updateDeliveryStatus('missing', { status: 'failed' });

      expect(result).toBeNull();
    });
  });

  describe('findDeliveriesByWebhookId', () => {
    it('returns paginated deliveries and total count', async () => {
      dbMock.select
        .mockReturnValueOnce(createQueryBuilder([{ count: 1 }]))
        .mockReturnValueOnce(createQueryBuilder([deliveryRow]));

      const result = await target.findDeliveriesByWebhookId('webhook-1', 1, 20);

      expect(result).toEqual({ data: [deliveryRow], total: 1 });
    });

    it('defaults total to 0 when the count query returns no rows', async () => {
      dbMock.select
        .mockReturnValueOnce(createQueryBuilder([]))
        .mockReturnValueOnce(createQueryBuilder([]));

      const result = await target.findDeliveriesByWebhookId('webhook-1', 1, 20);

      expect(result).toEqual({ data: [], total: 0 });
    });
  });
});
