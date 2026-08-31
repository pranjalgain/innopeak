import { QueueName } from '@bg/constants/job.constant';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { BullBoardModule } from '@bull-board/nestjs';
import { isAwsDeploymentTarget, isProduction } from '@config/deployment-target.util';
import { DynamicModule, Module } from '@nestjs/common';

const isAws = isAwsDeploymentTarget();

// Bull Board has no SQS equivalent — in 'aws' mode, DLQ visibility comes from the dev-tools panel
// (queue depth via GetQueueAttributesCommand) instead of this UI feature.
const bullBoardImports: DynamicModule[] = isAws
  ? []
  : [
      BullBoardModule.forFeature({
        name: QueueName.DEAD_LETTER,
        adapter: BullMQAdapter,
        options: {
          readOnlyMode: isProduction(),
          displayName: 'Dead Letter Queue',
          description: 'Queue for failed jobs from other queues',
        },
      }),
    ];

@Module({
  imports: bullBoardImports,
})
export class DeadLetterQueueUIModule {}
