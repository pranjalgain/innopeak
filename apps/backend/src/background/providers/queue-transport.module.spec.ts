import { QUEUE_JOB_OPTIONS, QUEUE_LIST, QueueName } from '@bg/constants/job.constant';

const registerQueue = jest.fn((...queues: unknown[]) => ({ module: 'BullModule', queues }));
jest.mock('@nestjs/bullmq', () => ({
  BullModule: { registerQueue: (...queues: unknown[]) => registerQueue(...queues) },
  getQueueToken: (name: string) => `queue:${name}`,
}));

// The publisher-side registration is where a queue's job defaults really take effect (a producer's `add` uses them); `QUEUE_JOB_OPTIONS`
// being right on its own proved nothing about the wiring.
describe('QueueTransportModule', () => {
  it('registers every queue with its own job defaults, review-sync apart', async () => {
    await import('./queue-transport.module');

    const registered = registerQueue.mock.calls[0] as Array<{
      name: QueueName;
      defaultJobOptions?: unknown;
    }>;
    expect(registered.map(queue => queue.name)).toEqual([...QUEUE_LIST]);
    for (const queue of registered) {
      if (queue.name === QueueName.REVIEW_SYNC) {
        expect(queue.defaultJobOptions).toBeUndefined();
      } else {
        expect(queue.defaultJobOptions).toEqual(QUEUE_JOB_OPTIONS[queue.name]);
      }
    }
  });
});
