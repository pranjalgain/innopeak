import type { EnvConfig } from '@config/env.config';
import { ConfigService } from '@nestjs/config';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';

import { SqsQueueStatusService } from './sqs-queue-status.service';

const mockSend = jest.fn();

jest.mock('@aws-sdk/client-sqs', () => ({
  SQSClient: jest.fn().mockImplementation(() => ({ send: mockSend })),
  GetQueueAttributesCommand: jest.fn().mockImplementation(input => ({ input })),
  GetQueueUrlCommand: jest.fn().mockImplementation(input => ({ input })),
}));

describe('SqsQueueStatusService', () => {
  let service: SqsQueueStatusService;
  let configValues: Record<string, string>;

  beforeEach(async () => {
    configValues = {
      DEPLOYMENT_TARGET: 'aws',
      EMAIL_QUEUE_URL: 'http://localhost:4566/000000000000/nestjs-app-email',
      NOTIFICATION_QUEUE_URL: 'http://localhost:4566/000000000000/nestjs-app-notification',
    };

    const configService = {
      get: jest.fn((key: string) => configValues[key]),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SqsQueueStatusService,
        { provide: ConfigService<EnvConfig>, useValue: configService },
      ],
    }).compile();

    service = module.get(SqsQueueStatusService);
  });

  afterEach(() => jest.clearAllMocks());

  it('skips queues whose <QUEUE>_QUEUE_URL env var is not configured', async () => {
    configValues = {
      DEPLOYMENT_TARGET: 'aws',
      EMAIL_QUEUE_URL: 'http://localhost:4566/000000000000/nestjs-app-email',
    };
    const configService = { get: jest.fn((key: string) => configValues[key]) };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SqsQueueStatusService,
        { provide: ConfigService<EnvConfig>, useValue: configService },
      ],
    }).compile();
    service = module.get(SqsQueueStatusService);

    mockSend.mockResolvedValue({ Attributes: { ApproximateNumberOfMessages: '0' } });

    const result = await service.getQueueDepths();

    expect(result).toHaveLength(1);
    expect(result[0]?.queueName).toBe('email');
  });

  it('returns main depth and derives DLQ depth from the RedrivePolicy attribute', async () => {
    mockSend
      .mockResolvedValueOnce({
        Attributes: {
          ApproximateNumberOfMessages: '3',
          RedrivePolicy: JSON.stringify({
            deadLetterTargetArn: 'arn:aws:sqs:us-east-1:000000000000:nestjs-app-email-dlq',
            maxReceiveCount: 3,
          }),
        },
      })
      .mockResolvedValueOnce({
        QueueUrl: 'http://localhost:4566/000000000000/nestjs-app-email-dlq',
      })
      .mockResolvedValueOnce({ Attributes: { ApproximateNumberOfMessages: '1' } })
      .mockResolvedValue({ Attributes: { ApproximateNumberOfMessages: '0' } });

    const result = await service.getQueueDepths();

    const email = result.find(q => q.queueName === 'email');
    expect(email).toEqual({ queueName: 'email', mainDepth: 3, dlqDepth: 1 });
  });

  it('returns dlqDepth null when the queue has no RedrivePolicy', async () => {
    mockSend.mockResolvedValue({ Attributes: { ApproximateNumberOfMessages: '0' } });

    const result = await service.getQueueDepths();

    expect(result.every(q => q.dlqDepth === null)).toBe(true);
  });

  it('logs and skips a queue whose depth lookup throws, without failing the whole call', async () => {
    mockSend
      .mockRejectedValueOnce(new Error('SQS unavailable'))
      .mockResolvedValue({ Attributes: { ApproximateNumberOfMessages: '0' } });

    const result = await service.getQueueDepths();

    expect(result.find(q => q.queueName === 'email')).toBeUndefined();
    expect(result.find(q => q.queueName === 'notification')).toBeDefined();
  });
});
