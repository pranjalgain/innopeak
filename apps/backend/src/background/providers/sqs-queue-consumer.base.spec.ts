import { QueueName } from '@bg/constants/job.constant';
import type { EnvConfig } from '@config/env.config';
import { Logger } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';

import {
  SQS_MAX_RECEIVE_COUNT,
  SQS_RECEIVE_BACKOFF_MAX_MS,
  SQS_RECEIVE_BACKOFF_START_MS,
  SQS_VISIBILITY_TIMEOUT_SECONDS,
  SqsQueueConsumerBase,
} from './sqs-queue-consumer.base';

interface Sent {
  constructor: { name: string };
  input: Record<string, unknown>;
}

class TestConsumer extends SqsQueueConsumerBase {
  protected readonly queueName = QueueName.EMAIL;
  protected readonly logger = new Logger('TestConsumer');
  readonly processed: Array<{ jobName: string; data: unknown }> = [];
  readonly failed: Array<{ jobName: string; data: unknown }> = [];
  readonly sleeps: number[] = [];
  processImpl: (jobName: string, data: unknown) => Promise<void> = () => Promise.resolve();

  protected process(jobName: string, data: unknown): Promise<void> {
    this.processed.push({ jobName, data });
    return this.processImpl(jobName, data);
  }

  filingFails = false;

  protected override onProcessingFailed(jobName: string, data: unknown): Promise<void> {
    this.failed.push({ jobName, data });
    return this.filingFails
      ? Promise.reject(new Error('dead-letter queue down'))
      : Promise.resolve();
  }

  // No real waiting: records the pause and ends the loop after a few, so a test cannot spin.
  protected override sleep(ms: number): Promise<void> {
    this.sleeps.push(ms);
    if (this.sleeps.length >= 8) this.stop();
    return Promise.resolve();
  }

  stop(): void {
    void this.onModuleDestroy();
  }

  async run(): Promise<void> {
    (this as unknown as { queueUrl: string }).queueUrl = 'http://sqs/queue';
    (this as unknown as { polling: boolean }).polling = true;
    await (this as unknown as { pollLoop: () => Promise<void> }).pollLoop();
  }

  handle(message: Record<string, unknown>): Promise<void> {
    (this as unknown as { queueUrl: string }).queueUrl = 'http://sqs/queue';
    return (
      this as unknown as { handleMessage: (m: Record<string, unknown>) => Promise<void> }
    ).handleMessage(message);
  }

  client(send: jest.Mock): void {
    (this as unknown as { sqsClient: { send: jest.Mock } }).sqsClient = { send };
  }
}

const config = { get: () => undefined } as unknown as ConfigService<EnvConfig>;
const message = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  MessageId: 'm-1',
  ReceiptHandle: 'rh-1',
  Body: JSON.stringify({ email: 'a@example.com' }),
  MessageAttributes: { JobName: { StringValue: 'email-otp-verification' } },
  Attributes: { ApproximateReceiveCount: '1' },
  ...overrides,
});

describe('SqsQueueConsumerBase', () => {
  let consumer: TestConsumer;
  let send: jest.Mock;
  const names = (): string[] => send.mock.calls.map(call => (call[0] as Sent).constructor.name);

  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    consumer = new TestConsumer(config);
    send = jest.fn().mockResolvedValue({});
    consumer.client(send);
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  describe('a receive error', () => {
    // The loop used to retry at once, so a down queue meant a hot loop and a flood of identical error lines.
    it('waits, doubling each time up to a cap, instead of retrying in a tight loop', async () => {
      send.mockRejectedValue(new Error('queue unreachable'));

      await consumer.run();

      expect(consumer.sleeps).toEqual([1000, 2000, 4000, 8000, 16000, 32000, 60000, 60000]);
      expect(consumer.sleeps[0]).toBe(SQS_RECEIVE_BACKOFF_START_MS);
      expect(Math.max(...consumer.sleeps)).toBe(SQS_RECEIVE_BACKOFF_MAX_MS);
    });

    it('starts over once a receive succeeds', async () => {
      send
        .mockRejectedValueOnce(new Error('blip'))
        .mockRejectedValueOnce(new Error('blip'))
        .mockResolvedValueOnce({ Messages: [] })
        .mockRejectedValue(new Error('blip again'));

      await consumer.run();

      expect(consumer.sleeps.slice(0, 4)).toEqual([1000, 2000, 1000, 2000]);
    });
  });

  describe('a message', () => {
    it('is deleted once processed', async () => {
      await consumer.handle(message());

      expect(consumer.processed).toHaveLength(1);
      expect(names()).toContain('DeleteMessageCommand');
    });

    // The body was parsed outside the try, so a malformed message escaped as a poll-loop error.
    it('that is not JSON fails on its own, is left for redrive and does not throw', async () => {
      await expect(consumer.handle(message({ Body: '{not json' }))).resolves.toBeUndefined();

      expect(consumer.processed).toHaveLength(0);
      expect(names()).not.toContain('DeleteMessageCommand');
    });

    it('that fails is left in place, not deleted', async () => {
      consumer.processImpl = () => Promise.reject(new Error('boom'));

      await consumer.handle(message());

      expect(names()).not.toContain('DeleteMessageCommand');
    });

    // Each earlier receive is about to be retried; filing it every time listed one failing message once per receive.
    it('is filed in the dead-letter dashboard only on its last receive', async () => {
      consumer.processImpl = () => Promise.reject(new Error('boom'));

      await consumer.handle(message({ Attributes: { ApproximateReceiveCount: '1' } }));
      await consumer.handle(message({ Attributes: { ApproximateReceiveCount: '2' } }));
      expect(consumer.failed).toHaveLength(0);

      await consumer.handle(
        message({ Attributes: { ApproximateReceiveCount: String(SQS_MAX_RECEIVE_COUNT) } })
      );
      expect(consumer.failed).toHaveLength(1);
    });

    // The BullMQ processors were fixed to survive this; here it used to escape to the poll loop and back the whole loop off.
    it('does not throw when filing the failure fails', async () => {
      consumer.processImpl = () => Promise.reject(new Error('boom'));
      consumer.filingFails = true;

      await expect(
        consumer.handle(
          message({ Attributes: { ApproximateReceiveCount: String(SQS_MAX_RECEIVE_COUNT) } })
        )
      ).resolves.toBeUndefined();
    });

    it('asks for the receive count', async () => {
      send.mockImplementation(() => {
        consumer.stop();
        return Promise.resolve({ Messages: [] });
      });

      await consumer.run();

      expect((send.mock.calls[0]?.[0] as Sent).input['MessageSystemAttributeNames']).toEqual([
        'ApproximateReceiveCount',
      ]);
    });
  });

  describe('a job longer than the visibility timeout', () => {
    // Otherwise SQS offers the message to another consumer while it runs: the job runs twice, and its success is still redriven.
    it('keeps its message hidden until it finishes, then stops extending', async () => {
      jest.useFakeTimers();
      let finish: () => void = () => undefined;
      consumer.processImpl = () => new Promise<void>(resolve => (finish = resolve));

      const handled = consumer.handle(message());
      await jest.advanceTimersByTimeAsync((SQS_VISIBILITY_TIMEOUT_SECONDS / 2) * 1000 * 3 + 100);

      const extensions = send.mock.calls
        .map(call => call[0] as Sent)
        .filter(command => command.constructor.name === 'ChangeMessageVisibilityCommand');
      expect(extensions).toHaveLength(3);
      expect(extensions[0]?.input).toMatchObject({
        ReceiptHandle: 'rh-1',
        VisibilityTimeout: SQS_VISIBILITY_TIMEOUT_SECONDS,
      });

      finish();
      await handled;
      const after = send.mock.calls.length;
      await jest.advanceTimersByTimeAsync(SQS_VISIBILITY_TIMEOUT_SECONDS * 1000 * 2);
      expect(send.mock.calls.length).toBe(after);
    });

    it('carries on when an extension fails', async () => {
      jest.useFakeTimers();
      let finish: () => void = () => undefined;
      consumer.processImpl = () => new Promise<void>(resolve => (finish = resolve));
      send.mockImplementation((command: Sent) => {
        if (command.constructor.name === 'ChangeMessageVisibilityCommand') {
          return Promise.reject(new Error('expired handle'));
        }
        return Promise.resolve({});
      });

      const handled = consumer.handle(message());
      await jest.advanceTimersByTimeAsync(SQS_VISIBILITY_TIMEOUT_SECONDS * 1000);
      finish();

      await expect(handled).resolves.toBeUndefined();
      expect(names()).toContain('DeleteMessageCommand');
    });
  });

  // Shutting down used to flip a flag and return, so the job in hand ran on while Nest closed the database and Redis under it.
  describe('shutting down', () => {
    it('lets the message being handled finish before it reports done', async () => {
      let finish!: () => void;
      consumer.processImpl = () =>
        new Promise<void>(resolve => {
          finish = resolve;
        });
      send.mockResolvedValueOnce({ Messages: [message()] }).mockResolvedValue({});
      const loop = consumer.run();
      (consumer as unknown as { loop: Promise<void> }).loop = loop;
      await Promise.resolve();
      await Promise.resolve();

      let drained = false;
      const destroying = consumer.onModuleDestroy().then(() => {
        drained = true;
      });
      await Promise.resolve();
      expect(drained).toBe(false);

      finish();
      await destroying;

      expect(drained).toBe(true);
      expect(names()).toContain('DeleteMessageCommand');
    });

    it('passes an abort signal to the long poll so shutdown does not wait out its 20 seconds', async () => {
      send.mockResolvedValue({});
      const loop = consumer.run();
      (consumer as unknown as { loop: Promise<void> }).loop = loop;
      await Promise.resolve();

      const options = send.mock.calls[0]?.[1] as { abortSignal: AbortSignal };
      expect(options.abortSignal.aborted).toBe(false);
      await consumer.onModuleDestroy();

      expect(options.abortSignal.aborted).toBe(true);
    });
  });
});
