import { Module } from '@nestjs/common';
import { ReviewPostQueueUIModule } from '@review-post-queue/review-post-queue-ui.module';

import { ReviewsController } from './reviews.controller';
import { ReviewsService } from './reviews.service';

/** ReviewPostQueueUIModule carries the producer ReviewsService enqueues post-back jobs through; DBModule is @Global. */
@Module({
  imports: [ReviewPostQueueUIModule],
  controllers: [ReviewsController],
  providers: [ReviewsService],
})
export class ReviewsModule {}
