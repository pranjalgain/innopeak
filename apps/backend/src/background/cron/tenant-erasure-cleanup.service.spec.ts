import type { BillingReconciliationService } from '@billing/services/billing-reconciliation.service';
import type { AuthDbService } from '@db/repositories/auth/auth.db-service';
import type { ConnectionsDbService } from '@db/repositories/connections/connections.db-service';
import type { ReviewSyncDbService } from '@db/repositories/review-sync/review-sync.db-service';
import type { ProviderCredentialService } from '@review-provider/provider-credential.service';

import { TenantErasureCleanupService } from './tenant-erasure-cleanup.service';

describe('TenantErasureCleanupService', () => {
  let target: TenantErasureCleanupService;
  let billing: { releaseBillingForErasure: jest.Mock };
  let connectionsDbService: { findConnectionByTenant: jest.Mock; disconnect: jest.Mock };
  let authDbService: { setActiveLocationId: jest.Mock };
  let reviewSyncDbService: { anonymizeReviewerPiiForTenant: jest.Mock };
  let credentialService: { revokeOrThrow: jest.Mock };

  beforeEach(() => {
    billing = { releaseBillingForErasure: jest.fn().mockResolvedValue(undefined) };
    connectionsDbService = {
      findConnectionByTenant: jest.fn(),
      disconnect: jest.fn().mockResolvedValue({ deactivatedLocationIds: ['loc-1'] }),
    };
    authDbService = { setActiveLocationId: jest.fn().mockResolvedValue(undefined) };
    reviewSyncDbService = { anonymizeReviewerPiiForTenant: jest.fn().mockResolvedValue(3) };
    credentialService = { revokeOrThrow: jest.fn().mockResolvedValue(undefined) };

    target = new TenantErasureCleanupService(
      billing as unknown as BillingReconciliationService,
      connectionsDbService as unknown as ConnectionsDbService,
      authDbService as unknown as AuthDbService,
      reviewSyncDbService as unknown as ReviewSyncDbService,
      credentialService as unknown as ProviderCredentialService
    );
  });

  it('releases billing, disconnects Google (revoking the stored credential) and anonymizes reviewers', async () => {
    connectionsDbService.findConnectionByTenant.mockResolvedValue({
      id: 'conn-1',
      disconnectedAt: null,
      credentialReference: 'secret-ref',
    });

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
    connectionsDbService.findConnectionByTenant.mockResolvedValue({
      id: 'conn-1',
      disconnectedAt: '2026-10-01T00:00:00.000Z',
      credentialReference: 'secret-ref',
    });

    await target.releaseExternalResources('tenant-1');

    expect(connectionsDbService.disconnect).not.toHaveBeenCalled();
    expect(credentialService.revokeOrThrow).toHaveBeenCalledWith('secret-ref');
  });

  it('copes with a tenant that never connected Google', async () => {
    connectionsDbService.findConnectionByTenant.mockResolvedValue(null);

    await target.releaseExternalResources('tenant-1');

    expect(credentialService.revokeOrThrow).not.toHaveBeenCalled();
    expect(reviewSyncDbService.anonymizeReviewerPiiForTenant).toHaveBeenCalledWith('tenant-1');
  });

  it('skips the tenant, anonymizing nobody, when Google cannot confirm the revocation', async () => {
    connectionsDbService.findConnectionByTenant.mockResolvedValue({
      id: 'conn-1',
      disconnectedAt: null,
      credentialReference: 'secret-ref',
    });
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
