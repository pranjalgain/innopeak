import { Module } from '@nestjs/common';

import { BillingModule } from './billing.module';
import { FreePlanCapStartup } from './services/free-plan-cap.startup';

/** API-only (imported by `AppModule`, never the worker), so the startup re-cap runs once per API instance. */
@Module({
  imports: [BillingModule],
  providers: [FreePlanCapStartup],
})
export class FreePlanCapModule {}
