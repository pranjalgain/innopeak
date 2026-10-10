import { JobName } from '@bg/constants/job.constant';
import type { EnvConfig } from '@config/env.config';
import type { DeadLetterQueueService } from '@dead-letter-queue/dead-letter-queue.service';
import type { EmailQueueService } from '@email-queue/email-queue.service';
import type { ConfigService } from '@nestjs/config';

import { EmailSqsConsumer } from './email-sqs.consumer';

/** The SQS transport must handle every email job the BullMQ processor does (see `process`'s doc comment). */
describe('EmailSqsConsumer', () => {
  it('dispatches LOCATIONS_PAUSED_EMAIL jobs to EmailQueueService.sendLocationsPausedEmail', async () => {
    const sendLocationsPausedEmail = jest.fn().mockResolvedValue(undefined);
    const consumer = new EmailSqsConsumer(
      { get: () => undefined } as unknown as ConfigService<EnvConfig>,
      { sendLocationsPausedEmail } as unknown as EmailQueueService,
      {} as DeadLetterQueueService
    );
    const data = { email: 'owner@example.com', locale: 'en' };

    await (
      consumer as unknown as { process: (name: string, data: unknown) => Promise<void> }
    ).process(JobName.LOCATIONS_PAUSED_EMAIL, data);

    expect(sendLocationsPausedEmail).toHaveBeenCalledWith(data);
  });
});
