import { Module } from '@nestjs/common';

import { BillingReconciliationModule } from './billing-reconciliation.module';
import { BillingWebhooksController } from './controllers/billing-webhooks.controller';
import { BillingController } from './controllers/billing.controller';
// NOTE: none of the repositories/DB services this module needs are imported here — `DBModule` is
// `@Global()` and provides all of them (`BillingPlansDbService`, `TenantSubscriptionsDbService`,
// `StripeWebhookEventsDbService`, `BillingReceiptsDbService`, `ConnectionsDbService`,
// `AuthDbService`, `ReviewSyncDbService`, `PlatformSettingsDbService`).
import { BillingEntitlementsService } from './services/billing-entitlements.service';
import { BillingWebhooksService } from './services/billing-webhooks.service';
import { BillingService } from './services/billing.service';

/**
 * Not `@Global()` — `BillingEntitlementsService` is real business logic, imported explicitly by
 * whichever modules need it for enforcement (`ConnectionsModule`, `PromptsModule`, `SettingsModule`
 * for `TenantMembersService`), the same way `AuthModule` imports `MediaModule`. The payment
 * provider factory lives in `BillingReconciliationModule` (imported above), which `CronModule` also
 * imports for the nightly reconciliation sweep — see that module's doc comment.
 */
@Module({
  controllers: [BillingController, BillingWebhooksController],
  imports: [BillingReconciliationModule],
  providers: [BillingService, BillingWebhooksService, BillingEntitlementsService],
  exports: [BillingEntitlementsService],
})
export class BillingModule {}
