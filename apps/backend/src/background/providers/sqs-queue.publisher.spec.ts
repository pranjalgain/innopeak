import { QueueName } from '@bg/constants/job.constant';
import type { ConfigService } from '@nestjs/config';

import { SqsQueuePublisher } from './sqs-queue.publisher';

const send = jest.fn();
jest.mock('@aws-sdk/client-sqs', () => ({
  SQSClient: jest.fn().mockImplementation(() => ({ send })),
  SendMessageCommand: jest.fn().mockImplementation((input: unknown) => ({ input })),
}));

function buildPublisher(): SqsQueuePublisher {
  const values: Record<string, string> = { REVIEW_POST_QUEUE_URL: 'http://sqs/review-post' };
  return new SqsQueuePublisher({
    get: (key: string) => values[key],
  } as unknown as ConfigService<never>);
}

describe('SqsQueuePublisher', () => {
  beforeEach(() => send.mockReset().mockResolvedValue({}));

  const sentInput = (): Record<string, unknown> =>
    (send.mock.calls[0]?.[0] as { input: Record<string, unknown> }).input;

  it('maps delayMs to DelaySeconds', async () => {
    await buildPublisher().publish(QueueName.REVIEW_POST, 'job', { a: 1 }, { delayMs: 90_000 });

    expect(sentInput()['DelaySeconds']).toBe(90);
  });

  it('clamps a delay longer than SQS allows to 15 minutes', async () => {
    await buildPublisher().publish(QueueName.REVIEW_POST, 'job', { a: 1 }, { delayMs: 3_600_000 });

    expect(sentInput()['DelaySeconds']).toBe(900);
  });

  it('sends no DelaySeconds when no delay is requested', async () => {
    await buildPublisher().publish(QueueName.REVIEW_POST, 'job', { a: 1 });

    expect(sentInput()).not.toHaveProperty('DelaySeconds');
  });
});
