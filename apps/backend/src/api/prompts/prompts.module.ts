import { BillingModule } from '@billing/billing.module';
import { Module } from '@nestjs/common';

import { PromptsController } from './prompts.controller';
import { PromptsService } from './prompts.service';

// `BillingModule` for `BillingEntitlementsService` — see that module's own doc comment for why a
// real cross-module business Service needs an explicit import, unlike the `@Global()` DB services.
@Module({
  imports: [BillingModule],
  controllers: [PromptsController],
  providers: [PromptsService],
  exports: [PromptsService],
})
export class PromptsModule {}
