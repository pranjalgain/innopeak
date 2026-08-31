import { isAwsDeploymentTarget } from '@config/deployment-target.util';
import { DeadLetterQueueModule } from '@dead-letter-queue/dead-letter-queue.module';
import { Module, Provider } from '@nestjs/common';
import { NotificationQueueService } from '@notification-queue/notification-queue.service';
import { NotificationSqsConsumer } from '@notification-queue/notification-sqs.consumer';
import { NotificationProcessor } from '@notification-queue/notification.processor';
import { NotificationsModule } from '@notifications/notifications.module';

const isAws = isAwsDeploymentTarget();
const consumerProvider: Provider = isAws ? NotificationSqsConsumer : NotificationProcessor;

@Module({
  imports: [NotificationsModule, DeadLetterQueueModule],
  providers: [consumerProvider, NotificationQueueService],
})
export class NotificationQueueModule {}
