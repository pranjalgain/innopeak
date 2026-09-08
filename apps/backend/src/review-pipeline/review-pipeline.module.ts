import { Global, Module } from '@nestjs/common';

import { ReviewClassificationService } from './review-classification.service';

/**
 * `@Global()` for the same reason `ReviewProviderModule` is: the backfill job that calls
 * `ReviewClassificationService` runs inside `WorkerModule`, which never imports API modules, so
 * both `AppModule` and `WorkerModule` import this once. Its DB access
 * (`ReviewPipelineDbService`) is registered in the already-global `DBModule`, not here.
 */
@Global()
@Module({
  providers: [ReviewClassificationService],
  exports: [ReviewClassificationService],
})
export class ReviewPipelineModule {}
