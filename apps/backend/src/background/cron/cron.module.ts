import { isAwsDeploymentTarget } from '@config/deployment-target.util';
import { CronSqsConsumer } from '@cron/cron-sqs.consumer';
import { CronProcessor } from '@cron/cron.processor';
import { CronService } from '@cron/cron.service';
import { DeadLetterQueueModule } from '@dead-letter-queue/dead-letter-queue.module';
import { Module, Provider } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';

const isAws = isAwsDeploymentTarget();
const consumerProvider: Provider = isAws ? CronSqsConsumer : CronProcessor;

@Module({
  imports: [ScheduleModule.forRoot(), DeadLetterQueueModule],
  providers: [consumerProvider, CronService],
})
export class CronModule {}
