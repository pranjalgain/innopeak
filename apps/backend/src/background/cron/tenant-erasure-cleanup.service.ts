import { BillingReconciliationService } from '@billing/services/billing-reconciliation.service';
import { AuthDbService } from '@db/repositories/auth/auth.db-service';
import { ConnectionsDbService } from '@db/repositories/connections/connections.db-service';
import { ReviewSyncDbService } from '@db/repositories/review-sync/review-sync.db-service';
import { Injectable } from '@nestjs/common';
import { ProviderCredentialService } from '@review-provider/provider-credential.service';

/**
 * Releases what an erased tenant holds outside the users table (Stripe billing, Google grant,
 * reviewer names) before anyone is anonymized. Every step is idempotent: on failure the caller
 * skips the tenant and the next night repeats it.
 */
@Injectable()
export class TenantErasureCleanupService {
  constructor(
    private readonly billingReconciliationService: BillingReconciliationService,
    private readonly connectionsDbService: ConnectionsDbService,
    private readonly authDbService: AuthDbService,
    private readonly reviewSyncDbService: ReviewSyncDbService,
    private readonly credentialService: ProviderCredentialService
  ) {}

  async releaseExternalResources(tenantId: string): Promise<void> {
    await this.billingReconciliationService.releaseBillingForErasure(tenantId);
    await this.disconnectGoogle(tenantId);
    await this.reviewSyncDbService.anonymizeReviewerPiiForTenant(tenantId);
  }

  /**
   * `ConnectionsService.disconnect` without a caller. The revoke runs even when already marked
   * disconnected (a prior night may have died after the DB half) and is strict: `revokeOrThrow`
   * throws so the tenant is retried rather than erased with a live grant.
   */
  private async disconnectGoogle(tenantId: string): Promise<void> {
    const connection = await this.connectionsDbService.findConnectionByTenant(tenantId);
    if (!connection) {
      return;
    }

    if (connection.disconnectedAt === null) {
      await this.connectionsDbService.disconnect(connection.id);
      await this.authDbService.setActiveLocationId({ tenantId, locationId: null });
    }

    await this.credentialService.revokeOrThrow(connection.credentialReference);
  }
}
