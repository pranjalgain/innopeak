import { Module } from '@nestjs/common';
import { ReviewPostQueueUIModule } from '@review-post-queue/review-post-queue-ui.module';

import { ReviewsController } from './reviews.controller';
import { ReviewsService } from './reviews.service';

/** DBModule is @Global, so ReviewSyncDbService/SettingsDbService resolve without an import here.
 *  ReviewPostQueueUIModule is explicit — it carries the ReviewPostQueue producer ReviewsService
 *  enqueues post-back jobs through. */
@Module({
  imports: [ReviewPostQueueUIModule],
  controllers: [ReviewsController],
  providers: [ReviewsService],
})
export class ReviewsModule {}
