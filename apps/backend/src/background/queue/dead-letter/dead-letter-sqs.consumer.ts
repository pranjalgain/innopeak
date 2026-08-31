import { QueueName } from '@bg/constants/job.constant';
import { SqsQueueConsumerBase } from '@bg/providers/sqs-queue-consumer.base';
import { EnvConfig } from '@config/env.config';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class DeadLetterSqsConsumer extends SqsQueueConsumerBase {
  protected readonly queueName = QueueName.DEAD_LETTER;
  protected readonly logger = new Logger(DeadLetterSqsConsumer.name);

  constructor(configService: ConfigService<EnvConfig>) {
    super(configService);
  }

  // Mirrors DeadLetterProcessor: log for manual review, nothing further to dispatch to.
  protected process(jobName: string, data: unknown): Promise<void> {
    this.logger.error(`Processing DLQ job of type ${jobName}: ${JSON.stringify(data)}`);
    return Promise.resolve();
  }
}
