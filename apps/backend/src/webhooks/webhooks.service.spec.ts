import { WebhooksRepository } from '@db/repositories/webhooks/webhooks.repository';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';

import { createHmac } from 'crypto';

import type { CreateWebhookDto } from './dto/create-webhook.dto';
import type { UpdateWebhookDto } from './dto/update-webhook.dto';
import type { WebhookDeliveryRecord, WebhookRecord } from './interfaces/webhook.interface';
import { WebhooksService } from './webhooks.service';

import { WebhookQueue } from '../background/queue/webhook/webhook.queue';

describe('WebhooksService', () => {
  let target: WebhooksService;
  let webhooksRepository: jest.Mocked<WebhooksRepository>;
  let webhookQueue: jest.Mocked<WebhookQueue>;

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
      providers: [
        WebhooksService,
        {
          provide: WebhooksRepository,
          useValue: {
            createWebhook: jest.fn(),
            findByUserId: jest.fn(),
            findById: jest.fn(),
            findByEvent: jest.fn(),
            updateWebhook: jest.fn(),
            deleteWebhook: jest.fn(),
            createDelivery: jest.fn(),
            findDeliveriesByWebhookId: jest.fn(),
          },
        },
        {
          provide: WebhookQueue,
          useValue: {
            addDeliveryJob: jest.fn(),
          },
        },
      ],
    }).compile();

    target = module.get(WebhooksService);
    webhooksRepository = module.get(WebhooksRepository);
    webhookQueue = module.get(WebhookQueue);
  });

  afterEach(() => jest.clearAllMocks());

  describe('create', () => {
    it('generates a secret and creates the webhook without description when not provided', async () => {
      const dto: CreateWebhookDto = { url: 'https://example.com/hook', events: ['user.created'] };
      const created = buildWebhookRecord();
      webhooksRepository.createWebhook.mockResolvedValue(created);

      const result = await target.create('user-1', dto);

      expect(result).toEqual(created);
      const callArg = webhooksRepository.createWebhook.mock.calls[0]?.[0];
      expect(callArg).toMatchObject({
        userId: 'user-1',
        url: dto.url,
        events: dto.events,
      });
      expect(callArg?.secret).toMatch(/^whsec_[a-f0-9]{64}$/);
      expect(callArg).not.toHaveProperty('description');
    });

    it('includes description in the payload when provided', async () => {
      const dto: CreateWebhookDto = {
        url: 'https://example.com/hook',
        events: ['user.created'],
        description: 'Notify CRM',
      };
      webhooksRepository.createWebhook.mockResolvedValue(buildWebhookRecord());

      await target.create('user-1', dto);

      const callArg = webhooksRepository.createWebhook.mock.calls[0]?.[0];
      expect(callArg?.description).toBe('Notify CRM');
    });
  });

  describe('findAllByUser', () => {
    it('returns all webhooks belonging to the user', async () => {
      const webhooks = [buildWebhookRecord()];
      webhooksRepository.findByUserId.mockResolvedValue(webhooks);

      const result = await target.findAllByUser('user-1');

      expect(result).toEqual(webhooks);
      expect(webhooksRepository.findByUserId).toHaveBeenCalledWith('user-1');
    });
  });

  describe('findOne', () => {
    it('returns the webhook when found and owned by the user', async () => {
      const webhook = buildWebhookRecord();
      webhooksRepository.findById.mockResolvedValue(webhook);

      const result = await target.findOne('webhook-1', 'user-1');

      expect(result).toEqual(webhook);
    });

    it('throws NotFoundException when the webhook does not exist', async () => {
      webhooksRepository.findById.mockResolvedValue(null);

      await expect(target.findOne('missing', 'user-1')).rejects.toThrow(NotFoundException);
    });

    it('throws ForbiddenException when the webhook belongs to a different user', async () => {
      webhooksRepository.findById.mockResolvedValue(buildWebhookRecord({ userId: 'someone-else' }));

      await expect(target.findOne('webhook-1', 'user-1')).rejects.toThrow(ForbiddenException);
    });
  });

  describe('update', () => {
    it('verifies ownership then applies only the defined fields', async () => {
      webhooksRepository.findById.mockResolvedValue(buildWebhookRecord());
      const updated = buildWebhookRecord({ url: 'https://new.example.com' });
      webhooksRepository.updateWebhook.mockResolvedValue(updated);

      const dto: UpdateWebhookDto = { url: 'https://new.example.com' };
      const result = await target.update('webhook-1', 'user-1', dto);

      expect(webhooksRepository.updateWebhook).toHaveBeenCalledWith('webhook-1', 'user-1', {
        url: 'https://new.example.com',
      });
      expect(result).toEqual(updated);
    });

    it('throws ForbiddenException before attempting the update when not owned by the user', async () => {
      webhooksRepository.findById.mockResolvedValue(buildWebhookRecord({ userId: 'someone-else' }));

      await expect(target.update('webhook-1', 'user-1', {})).rejects.toThrow(ForbiddenException);
      expect(webhooksRepository.updateWebhook).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when the update returns no row', async () => {
      webhooksRepository.findById.mockResolvedValue(buildWebhookRecord());
      webhooksRepository.updateWebhook.mockResolvedValue(null);

      await expect(target.update('webhook-1', 'user-1', {})).rejects.toThrow(NotFoundException);
    });
  });

  describe('remove', () => {
    it('verifies ownership then deletes the webhook', async () => {
      webhooksRepository.findById.mockResolvedValue(buildWebhookRecord());
      webhooksRepository.deleteWebhook.mockResolvedValue(true);

      await target.remove('webhook-1', 'user-1');

      expect(webhooksRepository.deleteWebhook).toHaveBeenCalledWith('webhook-1', 'user-1');
    });

    it('throws ForbiddenException when not owned and does not attempt delete', async () => {
      webhooksRepository.findById.mockResolvedValue(buildWebhookRecord({ userId: 'someone-else' }));

      await expect(target.remove('webhook-1', 'user-1')).rejects.toThrow(ForbiddenException);
      expect(webhooksRepository.deleteWebhook).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when the delete affected no rows', async () => {
      webhooksRepository.findById.mockResolvedValue(buildWebhookRecord());
      webhooksRepository.deleteWebhook.mockResolvedValue(false);

      await expect(target.remove('webhook-1', 'user-1')).rejects.toThrow(NotFoundException);
    });
  });

  describe('getDeliveries', () => {
    it('verifies ownership then returns paginated deliveries', async () => {
      webhooksRepository.findById.mockResolvedValue(buildWebhookRecord());
      const page = { data: [buildDeliveryRecord()], total: 1 };
      webhooksRepository.findDeliveriesByWebhookId.mockResolvedValue(page);

      const result = await target.getDeliveries('webhook-1', 'user-1', 1, 20);

      expect(webhooksRepository.findDeliveriesByWebhookId).toHaveBeenCalledWith('webhook-1', 1, 20);
      expect(result).toEqual(page);
    });

    it('throws ForbiddenException without querying deliveries when not owned', async () => {
      webhooksRepository.findById.mockResolvedValue(buildWebhookRecord({ userId: 'someone-else' }));

      await expect(target.getDeliveries('webhook-1', 'user-1', 1, 20)).rejects.toThrow(
        ForbiddenException
      );
      expect(webhooksRepository.findDeliveriesByWebhookId).not.toHaveBeenCalled();
    });
  });

  describe('dispatch', () => {
    it('does nothing when no webhooks are subscribed to the event', async () => {
      webhooksRepository.findByEvent.mockResolvedValue([]);

      await target.dispatch('user.created', { id: 'user-1' });

      expect(webhooksRepository.createDelivery).not.toHaveBeenCalled();
      expect(webhookQueue.addDeliveryJob).not.toHaveBeenCalled();
    });

    it('creates a delivery and queues a job for every subscribed webhook', async () => {
      const webhook = buildWebhookRecord();
      webhooksRepository.findByEvent.mockResolvedValue([webhook]);
      const delivery = buildDeliveryRecord();
      webhooksRepository.createDelivery.mockResolvedValue(delivery);

      await target.dispatch('user.created', { id: 'user-1' });

      expect(webhooksRepository.createDelivery).toHaveBeenCalledWith({
        webhookId: webhook.id,
        event: 'user.created',
        payload: { id: 'user-1' },
      });
      expect(webhookQueue.addDeliveryJob).toHaveBeenCalledWith({
        webhookId: webhook.id,
        deliveryId: delivery.id,
        url: webhook.url,
        secret: webhook.secret,
        event: 'user.created',
        payload: { id: 'user-1' },
      });
    });

    it('swallows errors for an individual webhook so other deliveries still proceed', async () => {
      const webhookA = buildWebhookRecord({ id: 'webhook-a' });
      const webhookB = buildWebhookRecord({ id: 'webhook-b' });
      webhooksRepository.findByEvent.mockResolvedValue([webhookA, webhookB]);
      webhooksRepository.createDelivery
        .mockRejectedValueOnce(new Error('db down'))
        .mockResolvedValueOnce(buildDeliveryRecord({ webhookId: 'webhook-b' }));

      await expect(target.dispatch('user.created', {})).resolves.toBeUndefined();

      expect(webhookQueue.addDeliveryJob).toHaveBeenCalledTimes(1);
      expect(webhookQueue.addDeliveryJob).toHaveBeenCalledWith(
        expect.objectContaining({ webhookId: 'webhook-b' })
      );
    });
  });

  describe('sendTestEvent', () => {
    it('verifies ownership, creates a test delivery and queues it', async () => {
      const webhook = buildWebhookRecord();
      webhooksRepository.findById.mockResolvedValue(webhook);
      const delivery = buildDeliveryRecord({ event: 'webhook.test' });
      webhooksRepository.createDelivery.mockResolvedValue(delivery);

      const result = await target.sendTestEvent('webhook-1', 'user-1');

      expect(webhooksRepository.createDelivery).toHaveBeenCalledWith(
        expect.objectContaining({ webhookId: webhook.id, event: 'webhook.test' })
      );
      expect(webhookQueue.addDeliveryJob).toHaveBeenCalledWith(
        expect.objectContaining({
          webhookId: webhook.id,
          deliveryId: delivery.id,
          url: webhook.url,
          secret: webhook.secret,
          event: 'webhook.test',
        })
      );
      expect(result).toEqual(delivery);
    });

    it('throws NotFoundException when the webhook does not exist', async () => {
      webhooksRepository.findById.mockResolvedValue(null);

      await expect(target.sendTestEvent('missing', 'user-1')).rejects.toThrow(NotFoundException);
      expect(webhooksRepository.createDelivery).not.toHaveBeenCalled();
    });
  });

  describe('generateSignature', () => {
    it('computes the same HMAC-SHA256 signature as a manually computed reference value', () => {
      const payload = JSON.stringify({ event: 'user.created', id: 'user-1' });
      const secret = 'test-fixture-signing-secret';
      const timestamp = '1700000000';

      const expected = `sha256=${createHmac('sha256', secret)
        .update(`${timestamp}.${payload}`)
        .digest('hex')}`;

      const result = target.generateSignature(payload, secret, timestamp);

      expect(result).toBe(expected);
      expect(result.startsWith('sha256=')).toBe(true);
    });

    it('produces a different signature when the secret changes', () => {
      const payload = 'the-payload';
      const timestamp = '1700000000';

      const signatureA = target.generateSignature(payload, 'secret-a', timestamp);
      const signatureB = target.generateSignature(payload, 'secret-b', timestamp);

      expect(signatureA).not.toBe(signatureB);
    });

    it('produces a different signature when the payload changes', () => {
      const secret = 'whsec_same_secret';
      const timestamp = '1700000000';

      const signatureA = target.generateSignature('payload-a', secret, timestamp);
      const signatureB = target.generateSignature('payload-b', secret, timestamp);

      expect(signatureA).not.toBe(signatureB);
    });

    it('is deterministic for the same inputs', () => {
      const first = target.generateSignature('same-payload', 'same-secret', '1700000000');
      const second = target.generateSignature('same-payload', 'same-secret', '1700000000');

      expect(first).toBe(second);
    });
  });
});
