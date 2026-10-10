import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';

import { BillingEntitlementsService } from './billing-entitlements.service';

/**
 * Re-applies the Free location cap once per API start (see `BillingEntitlementsService.reapplyFreeLocationCap`).
 * Its own provider in an API-only module: `BillingModule` is also loaded by the worker (through `AiModule`), and the
 * sweep must not run in both. Not awaited, so a slow or failing sweep never holds up or breaks boot.
 */
@Injectable()
export class FreePlanCapStartup implements OnApplicationBootstrap {
  private readonly logger = new Logger(FreePlanCapStartup.name);

  constructor(private readonly billingEntitlementsService: BillingEntitlementsService) {}

  onApplicationBootstrap(): void {
    void this.billingEntitlementsService
      .reapplyFreeLocationCap()
      .then(count => {
        if (count > 0) {
          this.logger.log(`Re-applied the Free location cap for ${count} tenant(s).`);
        }
      })
      .catch((error: unknown) => {
        this.logger.error(`Could not re-apply the Free location cap: ${(error as Error).message}`);
      });
  }
}
