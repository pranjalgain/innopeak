import type { IWebhookDeliveryJob } from '@bg/interfaces/job.interface';
import { WebhooksRepository } from '@db/repositories/webhooks/webhooks.repository';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';

import { WebhookQueueService } from './webhook-queue.service';

describe('WebhookQueueService', () => {
  let target: WebhookQueueService;
  let webhooksRepository: { updateDeliveryStatus: jest.Mock };
  let fetchMock: jest.Mock;
  const originalFetch = global.fetch;

  const data: IWebhookDeliveryJob = {
    webhookId: 'webhook-1',
    deliveryId: 'delivery-1',
    url: 'https://example.com/hook',
    secret: 'top-secret',
    event: 'user.created',
    payload: { id: 'user-1' },
  };

  beforeEach(async () => {
    webhooksRepository = { updateDeliveryStatus: jest.fn() };
    fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WebhookQueueService,
        { provide: WebhooksRepository, useValue: webhooksRepository },
      ],
    }).compile();

    target = module.get(WebhookQueueService);
  });

  afterEach(() => jest.clearAllMocks());

  afterAll(() => {
    global.fetch = originalFetch;
  });

  describe('deliverWebhook', () => {
    it('posts the payload with a valid HMAC signature and marks the delivery as delivered on 2xx', async () => {
      fetchMock.mockResolvedValue({
        status: 200,
        text: jest.fn().mockResolvedValue('ok'),
      });
      webhooksRepository.updateDeliveryStatus.mockResolvedValue({ id: 'delivery-1' });

      const result = await target.deliverWebhook(data);

      expect(result).toEqual({ statusCode: 200, body: 'ok' });
      expect(fetchMock).toHaveBeenCalledTimes(1);

      const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toBe(data.url);
      expect(options.method).toBe('POST');
      expect(options.body).toBe(JSON.stringify(data.payload));

      const headers = options.headers as Record<string, string>;
      expect(headers['Content-Type']).toBe('application/json');
      expect(headers['X-Webhook-Event']).toBe(data.event);
      expect(headers['X-Webhook-Delivery']).toBe(data.deliveryId);
      expect(headers['X-Webhook-Signature']).toMatch(/^sha256=[a-f0-9]{64}$/);

      expect(webhooksRepository.updateDeliveryStatus).toHaveBeenCalledWith(
        data.deliveryId,
        expect.objectContaining({
          status: 'delivered',
          responseStatus: 200,
          responseBody: 'ok',
          nextRetryAt: null,
        })
      );
    });

    it('marks the delivery as failed and throws when the response status is not 2xx', async () => {
      fetchMock.mockResolvedValue({
        status: 500,
        text: jest.fn().mockResolvedValue('Internal Server Error'),
      });
      webhooksRepository.updateDeliveryStatus.mockResolvedValue({ id: 'delivery-1' });

      await expect(target.deliverWebhook(data)).rejects.toThrow(
        'Webhook delivery failed with status 500'
      );

      expect(webhooksRepository.updateDeliveryStatus).toHaveBeenCalledWith(
        data.deliveryId,
        expect.objectContaining({ status: 'failed', responseStatus: 500 })
      );
    });

    it('truncates a very long response body to 2000 characters', async () => {
      const longBody = 'x'.repeat(3000);
      fetchMock.mockResolvedValue({
        status: 200,
        text: jest.fn().mockResolvedValue(longBody),
      });
      webhooksRepository.updateDeliveryStatus.mockResolvedValue({ id: 'delivery-1' });

      await target.deliverWebhook(data);

      expect(webhooksRepository.updateDeliveryStatus).toHaveBeenCalledWith(
        data.deliveryId,
        expect.objectContaining({ responseBody: longBody.substring(0, 2000) })
      );
    });

    it('marks the delivery as failed and throws a timeout error when the request aborts', async () => {
      const abortError = new Error('The operation was aborted');
      abortError.name = 'AbortError';
      fetchMock.mockRejectedValue(abortError);
      webhooksRepository.updateDeliveryStatus.mockResolvedValue({ id: 'delivery-1' });

      await expect(target.deliverWebhook(data)).rejects.toThrow('Webhook delivery timed out');

      expect(webhooksRepository.updateDeliveryStatus).toHaveBeenCalledWith(
        data.deliveryId,
        expect.objectContaining({
          status: 'failed',
          responseBody: 'Request timed out after 30 seconds',
        })
      );
    });

    it('marks the delivery as failed and re-throws on network errors', async () => {
      const networkError = new Error('getaddrinfo ENOTFOUND example.com');
      fetchMock.mockRejectedValue(networkError);
      webhooksRepository.updateDeliveryStatus.mockResolvedValue({ id: 'delivery-1' });

      await expect(target.deliverWebhook(data)).rejects.toThrow(networkError.message);

      expect(webhooksRepository.updateDeliveryStatus).toHaveBeenCalledWith(
        data.deliveryId,
        expect.objectContaining({
          status: 'failed',
          responseBody: networkError.message,
        })
      );
    });
  });
});
