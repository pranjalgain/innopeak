import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';

import type { WebhookDeliveryRecord, WebhookRecord } from './interfaces/webhook.interface';
import { WebhooksController } from './webhooks.controller';
import { WebhooksService } from './webhooks.service';

import type { AuthUser } from '../auth/interfaces/auth-user.interface';

describe('WebhooksController', () => {
  let target: WebhooksController;
  let webhooksService: jest.Mocked<WebhooksService>;

  const authUser: AuthUser = {
    id: 'user-1',
    email: 'jane@example.com',
    roles: ['user'],
    permissions: [],
  };

  const buildWebhookRecord = (overrides: Partial<WebhookRecord> = {}): WebhookRecord => ({
    id: 'webhook-1',
    userId: 'user-1',
    url: 'https://example.com/webhooks/receive',
    secret: 'whsec_test',
    events: ['user.created'],
    isActive: true,
    description: null,
    createdAt: new Date('2024-01-01T00:00:00.000Z'),
    updatedAt: new Date('2024-01-01T00:00:00.000Z'),
    ...overrides,
  });

  const buildDeliveryRecord = (
    overrides: Partial<WebhookDeliveryRecord> = {}
  ): WebhookDeliveryRecord => ({
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
    ...overrides,
  });

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [WebhooksController],
      providers: [
        {
          provide: WebhooksService,
          useValue: {
            create: jest.fn(),
            findAllByUser: jest.fn(),
            findOne: jest.fn(),
            update: jest.fn(),
            remove: jest.fn(),
            getDeliveries: jest.fn(),
            sendTestEvent: jest.fn(),
          },
        },
      ],
    }).compile();

    target = module.get(WebhooksController);
    webhooksService = module.get(WebhooksService);
  });

  afterEach(() => jest.clearAllMocks());

  describe('create', () => {
    it('delegates to the service with the current user id and returns the response dto', async () => {
      const dto = { url: 'https://example.com/hook', events: ['user.created'] };
      webhooksService.create.mockResolvedValue(buildWebhookRecord());

      const result = await target.create(authUser, dto);

      expect(webhooksService.create).toHaveBeenCalledWith('user-1', dto);
      expect(result).toMatchObject({ id: 'webhook-1', url: buildWebhookRecord().url });
    });
  });

  describe('findAll', () => {
    it('returns all webhooks for the current user wrapped in a data envelope', async () => {
      webhooksService.findAllByUser.mockResolvedValue([buildWebhookRecord()]);

      const result = await target.findAll(authUser);

      expect(webhooksService.findAllByUser).toHaveBeenCalledWith('user-1');
      expect(result.data).toHaveLength(1);
      expect(result.data[0]).toMatchObject({ id: 'webhook-1' });
    });
  });

  describe('findOne', () => {
    it('delegates to the service and returns the response dto', async () => {
      webhooksService.findOne.mockResolvedValue(buildWebhookRecord());

      const result = await target.findOne('webhook-1', authUser);

      expect(webhooksService.findOne).toHaveBeenCalledWith('webhook-1', 'user-1');
      expect(result.id).toBe('webhook-1');
    });

    it('propagates errors thrown by the service (e.g. not found/forbidden)', async () => {
      webhooksService.findOne.mockRejectedValue(new Error('Webhook not found'));

      await expect(target.findOne('missing', authUser)).rejects.toThrow('Webhook not found');
    });
  });

  describe('update', () => {
    it('delegates to the service and returns the updated response dto', async () => {
      const dto = { url: 'https://new.example.com' };
      webhooksService.update.mockResolvedValue(
        buildWebhookRecord({ url: 'https://new.example.com' })
      );

      const result = await target.update('webhook-1', authUser, dto);

      expect(webhooksService.update).toHaveBeenCalledWith('webhook-1', 'user-1', dto);
      expect(result.url).toBe('https://new.example.com');
    });
  });

  describe('remove', () => {
    it('delegates removal to the service', async () => {
      webhooksService.remove.mockResolvedValue(undefined);

      await target.remove('webhook-1', authUser);

      expect(webhooksService.remove).toHaveBeenCalledWith('webhook-1', 'user-1');
    });
  });

  describe('getDeliveries', () => {
    it('delegates to the service and shapes paginated response with meta', async () => {
      webhooksService.getDeliveries.mockResolvedValue({
        data: [buildDeliveryRecord()],
        total: 1,
      });

      const result = await target.getDeliveries('webhook-1', authUser, 1, 20);

      expect(webhooksService.getDeliveries).toHaveBeenCalledWith('webhook-1', 'user-1', 1, 20);
      expect(result.data).toHaveLength(1);
      expect(result.meta).toEqual({ page: 1, pageSize: 20, total: 1, totalPages: 1 });
    });

    it('computes totalPages correctly for partial pages', async () => {
      webhooksService.getDeliveries.mockResolvedValue({ data: [], total: 25 });

      const result = await target.getDeliveries('webhook-1', authUser, 2, 20);

      expect(result.meta.totalPages).toBe(2);
    });
  });

  describe('sendTestEvent', () => {
    it('delegates to the service and returns a confirmation with the delivery dto', async () => {
      webhooksService.sendTestEvent.mockResolvedValue(buildDeliveryRecord());

      const result = await target.sendTestEvent('webhook-1', authUser);

      expect(webhooksService.sendTestEvent).toHaveBeenCalledWith('webhook-1', 'user-1');
      expect(result.message).toBe('Test webhook delivery queued');
      expect(result.delivery).toMatchObject({ id: 'delivery-1' });
    });
  });
});
