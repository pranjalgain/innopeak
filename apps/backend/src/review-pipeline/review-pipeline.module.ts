import { Global, Module } from '@nestjs/common';

import { ReviewClassificationService } from './review-classification.service';

/**
 * `@Global()` like `ReviewProviderModule`: the backfill job calling `ReviewClassificationService` runs in `WorkerModule`,
 * which never imports API modules. Its DB access (`ReviewPipelineDbService`) lives in the already-global `DBModule`.
 */
@Global()
@Module({
  providers: [ReviewClassificationService],
  exports: [ReviewClassificationService],
})
export class ReviewPipelineModule {}
