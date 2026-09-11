import { LocationStatus } from '@common/enums/location-status.enum';
import { ReviewProviderConnectionStatus } from '@common/enums/review-provider-connection-status.enum';
import { ReviewProvider } from '@common/enums/review-provider.enum';
import { SyncRunStatus } from '@common/enums/sync-run-status.enum';
import { SyncTrigger } from '@common/enums/sync-trigger.enum';
import { Test } from '@nestjs/testing';

import { ConnectionsDbService, LocationLimitExceededError } from './connections.db-service';
import { ConnectionsRepository, type ProviderConnectionRow } from './connections.repository';

import { ReviewSyncRepository } from '../review-sync/review-sync.repository';

const connection: ProviderConnectionRow = {
  id: 'connection-1',
  tenantId: 'tenant-1',
  connectedByUserId: 'user-1',
  provider: ReviewProvider.GOOGLE,
  providerAccountId: 'accounts/1',
  credentialReference: 'local-redis:secret-1',
  tokenExpiresAt: null,
  status: ReviewProviderConnectionStatus.ACTIVE,
  disconnectedAt: null,
  createdAt: '2026-01-01T00:00:00.000Z',
};

function locationRow(externalLocationId: string) {
  return {
    id: `location-${externalLocationId}`,
    tenantId: 'tenant-1',
    providerConnectionId: 'connection-1',
    provider: ReviewProvider.GOOGLE,
    externalLocationId,
    name: 'The Coffee House',
    address: null,
    status: LocationStatus.ACTIVE,
    lastSyncedAt: null,
    lastSyncStatus: null,
    lastSyncError: null,
    onboardingBackfillCompletedAt: null,
    lastReviewSyncedAt: null,
    createdAt: '2026-01-01T00:00:00.000Z',
  };
}

/**
 * `MAX_ACTIVE_LOCATIONS` (MVP's one-active-location rule) has no database constraint behind it,
 * so `ConnectionsService.assertLocationLimit`'s pre-check is the only thing guarding it — and
 * that check runs *before* this transaction even opens. Under READ COMMITTED, two concurrent
 * `confirmLocation` calls for *different* `externalLocationId`s can each see zero active
 * locations (neither has committed anything for the other to see yet), both pass the pre-check,
 * and both commit — silently doubling a tenant past the limit. `acquireLocationConfirmLock`
 * closes it with a transaction-scoped advisory lock: the second call blocks until the first
 * commits, so its own recheck here runs against the first one's already-committed row.
 */
describe('ConnectionsDbService.confirmLocation — location limit is rechecked under lock', () => {
  let service: ConnectionsDbService;
  const acquireLocationConfirmLock = jest.fn();
  const findLocationsByTenant = jest.fn();
  const upsertLocation = jest.fn();
  const attachUserToLocation = jest.fn();
  const acquireSyncRun = jest.fn();

  const txMock = {
    transaction: jest.fn(async (fn: (nested: unknown) => Promise<unknown>) => fn({})),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    acquireLocationConfirmLock.mockResolvedValue(undefined);
    attachUserToLocation.mockResolvedValue(undefined);
    upsertLocation.mockImplementation((_tx: unknown, input: { externalLocationId: string }) =>
      Promise.resolve(locationRow(input.externalLocationId))
    );
    acquireSyncRun.mockResolvedValue({
      id: 'run-1',
      tenantId: 'tenant-1',
      locationId: 'location-locations/1',
      trigger: SyncTrigger.BACKFILL,
      startedAt: '2026-01-01T00:00:00.000Z',
      completedAt: null,
      status: SyncRunStatus.RUNNING,
      reviewsFetched: null,
      reviewsTotal: null,
      errorMessage: null,
      updatedAt: '2026-01-01T00:00:00.000Z',
    });

    const moduleRef = await Test.createTestingModule({
      providers: [
        ConnectionsDbService,
        {
          provide: ConnectionsRepository,
          useValue: {
            transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(txMock)),
            acquireLocationConfirmLock,
            findLocationsByTenant,
            upsertLocation,
            attachUserToLocation,
          },
        },
        { provide: ReviewSyncRepository, useValue: { acquireSyncRun } },
      ],
    }).compile();

    service = moduleRef.get(ConnectionsDbService);
  });

  it('acquires the per-tenant lock before checking the active-location count', async () => {
    findLocationsByTenant.mockResolvedValue([]);

    await service.confirmLocation({
      tenantId: 'tenant-1',
      userId: 'user-1',
      connection,
      externalLocationId: 'locations/1',
      name: 'The Coffee House',
      address: null,
      maxActiveLocations: 1,
    });

    expect(acquireLocationConfirmLock).toHaveBeenCalledWith(txMock, 'tenant-1');
    const lockOrder = acquireLocationConfirmLock.mock.invocationCallOrder[0];
    const checkOrder = findLocationsByTenant.mock.invocationCallOrder[0];
    expect(lockOrder).toBeLessThan(checkOrder as number);
  });

  it('rejects a second location once the tenant is already at its limit', async () => {
    findLocationsByTenant.mockResolvedValue([locationRow('locations/1')]);

    await expect(
      service.confirmLocation({
        tenantId: 'tenant-1',
        userId: 'user-1',
        connection,
        externalLocationId: 'locations/2',
        name: 'The Bakery',
        address: null,
        maxActiveLocations: 1,
      })
    ).rejects.toBeInstanceOf(LocationLimitExceededError);

    expect(upsertLocation).not.toHaveBeenCalled();
  });

  it('allows re-confirming the same location even while at the limit', async () => {
    findLocationsByTenant.mockResolvedValue([locationRow('locations/1')]);

    const result = await service.confirmLocation({
      tenantId: 'tenant-1',
      userId: 'user-1',
      connection,
      externalLocationId: 'locations/1',
      name: 'The Coffee House',
      address: null,
      maxActiveLocations: 1,
    });

    expect(result.location.externalLocationId).toBe('locations/1');
    expect(upsertLocation).toHaveBeenCalled();
  });

  it('allows a new location under the limit', async () => {
    findLocationsByTenant.mockResolvedValue([]);

    const result = await service.confirmLocation({
      tenantId: 'tenant-1',
      userId: 'user-1',
      connection,
      externalLocationId: 'locations/1',
      name: 'The Coffee House',
      address: null,
      maxActiveLocations: 1,
    });

    expect(result.location.externalLocationId).toBe('locations/1');
  });
});
