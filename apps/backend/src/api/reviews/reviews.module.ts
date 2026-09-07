import { Module } from '@nestjs/common';

import { ReviewsController } from './reviews.controller';
import { ReviewsService } from './reviews.service';

/** DBModule is @Global, so ReviewSyncDbService resolves without an import here. */
@Module({
  controllers: [ReviewsController],
  providers: [ReviewsService],
})
export class ReviewsModule {}
