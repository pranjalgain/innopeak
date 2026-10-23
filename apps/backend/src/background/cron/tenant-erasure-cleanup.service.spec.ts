import type { BillingReconciliationService } from '@billing/services/billing-reconciliation.service';
import type { AuthDbService } from '@db/repositories/auth/auth.db-service';
import type { ConnectionsDbService } from '@db/repositories/connections/connections.db-service';
import type { ReviewSyncDbService } from '@db/repositories/review-sync/review-sync.db-service';
import type { ProviderCredentialService } from '@review-provider/provider-credential.service';

import { TenantErasureCleanupService } from './tenant-erasure-cleanup.service';

describe('TenantErasureCleanupService', () => {
  let target: TenantErasureCleanupService;
  let billing: { releaseBillingForErasure: jest.Mock };
  let connectionsDbService: { findConnectionsByTenant: jest.Mock; disconnect: jest.Mock };
  let authDbService: { setActiveLocationId: jest.Mock };
  let reviewSyncDbService: { anonymizeReviewerPiiForTenant: jest.Mock };
  let credentialService: { revokeOrThrow: jest.Mock; invalidateAccessToken: jest.Mock };

  beforeEach(() => {
    billing = { releaseBillingForErasure: jest.fn().mockResolvedValue(undefined) };
    connectionsDbService = {
      findConnectionsByTenant: jest.fn().mockResolvedValue([]),
      disconnect: jest.fn().mockResolvedValue({ deactivatedLocationIds: ['loc-1'] }),
    };
    authDbService = { setActiveLocationId: jest.fn().mockResolvedValue(undefined) };
    reviewSyncDbService = { anonymizeReviewerPiiForTenant: jest.fn().mockResolvedValue(3) };
    credentialService = {
      revokeOrThrow: jest.fn().mockResolvedValue(undefined),
      invalidateAccessToken: jest.fn().mockResolvedValue(undefined),
    };

    target = new TenantErasureCleanupService(
      billing as unknown as BillingReconciliationService,
      connectionsDbService as unknown as ConnectionsDbService,
      authDbService as unknown as AuthDbService,
      reviewSyncDbService as unknown as ReviewSyncDbService,
      credentialService as unknown as ProviderCredentialService
    );
  });

  it('releases billing, disconnects Google (revoking the stored credential) and anonymizes reviewers', async () => {
    connectionsDbService.findConnectionsByTenant.mockResolvedValue([
      {
        id: 'conn-1',
        disconnectedAt: null,
        credentialReference: 'secret-ref',
      },
    ]);

    await target.releaseExternalResources('tenant-1');

    expect(billing.releaseBillingForErasure).toHaveBeenCalledWith('tenant-1');
    expect(connectionsDbService.disconnect).toHaveBeenCalledWith('conn-1');
    expect(authDbService.setActiveLocationId).toHaveBeenCalledWith({
      tenantId: 'tenant-1',
      locationId: null,
    });
    expect(credentialService.revokeOrThrow).toHaveBeenCalledWith('secret-ref');
    expect(reviewSyncDbService.anonymizeReviewerPiiForTenant).toHaveBeenCalledWith('tenant-1');
  });

  it('still revokes the credential of a connection a previous night marked disconnected', async () => {
    connectionsDbService.findConnectionsByTenant.mockResolvedValue([
      {
        id: 'conn-1',
        disconnectedAt: '2026-10-01T00:00:00.000Z',
        credentialReference: 'secret-ref',
      },
    ]);

    await target.releaseExternalResources('tenant-1');

    expect(connectionsDbService.disconnect).not.toHaveBeenCalled();
    expect(credentialService.revokeOrThrow).toHaveBeenCalledWith('secret-ref');
  });

  // A reconnect with another account leaves the old row behind; its grant must not outlive the business either.
  it('revokes every grant the tenant ever made, not only the newest connection', async () => {
    connectionsDbService.findConnectionsByTenant.mockResolvedValue([
      { id: 'conn-new', disconnectedAt: null, credentialReference: 'ref-new' },
      {
        id: 'conn-old',
        disconnectedAt: '2026-08-01T00:00:00.000Z',
        credentialReference: 'ref-old',
      },
    ]);

    await target.releaseExternalResources('tenant-1');

    expect(connectionsDbService.disconnect).toHaveBeenCalledTimes(1);
    expect(connectionsDbService.disconnect).toHaveBeenCalledWith('conn-new');
    expect(credentialService.revokeOrThrow).toHaveBeenCalledWith('ref-new');
    expect(credentialService.revokeOrThrow).toHaveBeenCalledWith('ref-old');
  });

  it('copes with a tenant that never connected Google', async () => {
    connectionsDbService.findConnectionsByTenant.mockResolvedValue([]);

    await target.releaseExternalResources('tenant-1');

    expect(credentialService.revokeOrThrow).not.toHaveBeenCalled();
    expect(reviewSyncDbService.anonymizeReviewerPiiForTenant).toHaveBeenCalledWith('tenant-1');
  });

  it('skips the tenant, anonymizing nobody, when Google cannot confirm the revocation', async () => {
    connectionsDbService.findConnectionsByTenant.mockResolvedValue([
      {
        id: 'conn-1',
        disconnectedAt: null,
        credentialReference: 'secret-ref',
      },
    ]);
    credentialService.revokeOrThrow.mockRejectedValue(new Error('Google did not confirm'));

    await expect(target.releaseExternalResources('tenant-1')).rejects.toThrow('Google did not');

    expect(reviewSyncDbService.anonymizeReviewerPiiForTenant).not.toHaveBeenCalled();
  });

  it('stops before anonymizing reviewers if billing cannot be released', async () => {
    billing.releaseBillingForErasure.mockRejectedValue(new Error('stripe unreachable'));

    await expect(target.releaseExternalResources('tenant-1')).rejects.toThrow('stripe unreachable');

    expect(connectionsDbService.disconnect).not.toHaveBeenCalled();
    expect(reviewSyncDbService.anonymizeReviewerPiiForTenant).not.toHaveBeenCalled();
  });
});
