import { LocationStatus } from '@common/enums/location-status.enum';
import { ReviewProviderConnectionStatus } from '@common/enums/review-provider-connection-status.enum';
import { ReviewProvider } from '@common/enums/review-provider.enum';
import { SyncRunStatus } from '@common/enums/sync-run-status.enum';
import { SyncTrigger } from '@common/enums/sync-trigger.enum';
import { Test } from '@nestjs/testing';

import { ConnectionsDbService, LocationLimitExceededError } from './connections.db-service';
import { ConnectionsRepository } from './connections.repository';
import type { LocationRow, ProviderConnectionRow } from './types/connections.type';

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
    phone: null,
    websiteUri: null,
    category: null,
    googleRating: null,
    googleReviewCount: null,
    detailsRefreshedAt: null,
    reviewsReconciledAt: null,
    status: LocationStatus.ACTIVE,
    lastSyncedAt: null,
    lastSyncStatus: null,
    lastSyncError: null,
    onboardingBackfillCompletedAt: null,
    lastReviewSyncedAt: null,
    billingPausedAt: null,
    createdAt: '2026-01-01T00:00:00.000Z',
  };
}

/**
 * `MAX_ACTIVE_LOCATIONS` has no DB constraint and the service's pre-check runs before this
 * transaction opens, so under READ COMMITTED two concurrent `confirmLocation` calls for different
 * locations could both pass and exceed the limit. `acquireLocationConfirmLock` (advisory lock)
 * makes the second block until the first commits.
 */
describe('ConnectionsDbService.confirmLocations — location limit is rechecked under lock', () => {
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

    await service.confirmLocations({
      tenantId: 'tenant-1',
      userId: 'user-1',
      connection,
      locations: [
        {
          externalLocationId: 'locations/1',
          name: 'The Coffee House',
          address: null,
          phone: null,
          websiteUri: null,
          category: null,
        },
      ],
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
      service.confirmLocations({
        tenantId: 'tenant-1',
        userId: 'user-1',
        connection,
        locations: [
          {
            externalLocationId: 'locations/2',
            name: 'The Bakery',
            address: null,
            phone: null,
            websiteUri: null,
            category: null,
          },
        ],
        maxActiveLocations: 1,
      })
    ).rejects.toBeInstanceOf(LocationLimitExceededError);

    expect(upsertLocation).not.toHaveBeenCalled();
  });

  it('rejects the whole batch once an earlier location in the same call fills the limit', async () => {
    findLocationsByTenant.mockResolvedValue([]);

    await expect(
      service.confirmLocations({
        tenantId: 'tenant-1',
        userId: 'user-1',
        connection,
        locations: [
          {
            externalLocationId: 'locations/1',
            name: 'The Coffee House',
            address: null,
            phone: null,
            websiteUri: null,
            category: null,
          },
          {
            externalLocationId: 'locations/2',
            name: 'The Bakery',
            address: null,
            phone: null,
            websiteUri: null,
            category: null,
          },
        ],
        maxActiveLocations: 1,
      })
    ).rejects.toBeInstanceOf(LocationLimitExceededError);

    expect(upsertLocation).toHaveBeenCalledTimes(1);
  });

  it('allows re-confirming the same location even while at the limit', async () => {
    findLocationsByTenant.mockResolvedValue([locationRow('locations/1')]);

    const [result] = await service.confirmLocations({
      tenantId: 'tenant-1',
      userId: 'user-1',
      connection,
      locations: [
        {
          externalLocationId: 'locations/1',
          name: 'The Coffee House',
          address: null,
          phone: null,
          websiteUri: null,
          category: null,
        },
      ],
      maxActiveLocations: 1,
    });

    expect(result?.location.externalLocationId).toBe('locations/1');
    expect(upsertLocation).toHaveBeenCalled();
  });

  // The backfill walks up to 20 pages of Google and blocks the location's polls while it runs; re-running it for nothing cost both.
  it('starts no backfill for a location that already finished onboarding, but still attaches the user', async () => {
    findLocationsByTenant.mockResolvedValue([locationRow('locations/1')]);
    upsertLocation.mockResolvedValue({
      ...locationRow('locations/1'),
      onboardingBackfillCompletedAt: '2026-01-02T00:00:00.000Z',
    });

    const [result] = await service.confirmLocations({
      tenantId: 'tenant-1',
      userId: 'user-1',
      connection,
      locations: [
        {
          externalLocationId: 'locations/1',
          name: 'The Coffee House',
          address: null,
          phone: null,
          websiteUri: null,
          category: null,
        },
      ],
      maxActiveLocations: 1,
    });

    expect(acquireSyncRun).not.toHaveBeenCalled();
    expect(result).toMatchObject({ backfill: null, backfillAlreadyRunning: false });
    expect(attachUserToLocation).toHaveBeenCalledWith(expect.anything(), {
      userId: 'user-1',
      locationId: 'location-locations/1',
    });
  });

  it('allows a new location under the limit', async () => {
    findLocationsByTenant.mockResolvedValue([]);

    const [result] = await service.confirmLocations({
      tenantId: 'tenant-1',
      userId: 'user-1',
      connection,
      locations: [
        {
          externalLocationId: 'locations/1',
          name: 'The Coffee House',
          address: null,
          phone: null,
          websiteUri: null,
          category: null,
        },
      ],
      maxActiveLocations: 1,
    });

    expect(result?.location.externalLocationId).toBe('locations/1');
  });

  it('confirms multiple locations from a single request inside one transaction', async () => {
    findLocationsByTenant.mockResolvedValue([]);

    const results = await service.confirmLocations({
      tenantId: 'tenant-1',
      userId: 'user-1',
      connection,
      locations: [
        {
          externalLocationId: 'locations/1',
          name: 'The Coffee House',
          address: null,
          phone: null,
          websiteUri: null,
          category: null,
        },
        {
          externalLocationId: 'locations/2',
          name: 'The Bakery',
          address: null,
          phone: null,
          websiteUri: null,
          category: null,
        },
      ],
      maxActiveLocations: 2,
    });

    expect(results.map(result => result.location.externalLocationId)).toEqual([
      'locations/1',
      'locations/2',
    ]);
    expect(upsertLocation).toHaveBeenCalledTimes(2);
    expect(attachUserToLocation).toHaveBeenCalledTimes(2);
  });
});

/**
 * `idx_sync_runs_location_id_running` allows one running run per location regardless of trigger, so
 * acquiring a backfill can lose to an existing run. The conflict handler must report that honestly,
 * including when nothing is there after all.
 */
describe('ConnectionsDbService.confirmLocations — sync-run acquisition conflicts', () => {
  let service: ConnectionsDbService;
  const findLocationsByTenant = jest.fn();
  const upsertLocation = jest.fn();
  const acquireSyncRun = jest.fn();
  const findRunningRunForLocation = jest.fn();

  const txMock = {
    transaction: jest.fn(async (fn: (nested: unknown) => Promise<unknown>) => fn({})),
  };

  function runRow(overrides: Partial<{ id: string; trigger: SyncTrigger }> = {}) {
    return {
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
      ...overrides,
    };
  }

  /** What node-postgres raises when the partial unique index rejects a second running run. */
  function uniqueViolation(): Error {
    return Object.assign(new Error('duplicate key value violates unique constraint'), {
      code: '23505',
      constraint: 'idx_sync_runs_location_id_running',
    });
  }

  async function confirmOne() {
    return service.confirmLocations({
      tenantId: 'tenant-1',
      userId: 'user-1',
      connection,
      locations: [
        {
          externalLocationId: 'locations/1',
          name: 'The Coffee House',
          address: null,
          phone: null,
          websiteUri: null,
          category: null,
        },
      ],
      maxActiveLocations: 5,
    });
  }

  beforeEach(async () => {
    jest.clearAllMocks();

    findLocationsByTenant.mockResolvedValue([]);
    upsertLocation.mockImplementation((_tx: unknown, input: { externalLocationId: string }) =>
      Promise.resolve(locationRow(input.externalLocationId))
    );

    const moduleRef = await Test.createTestingModule({
      providers: [
        ConnectionsDbService,
        {
          provide: ConnectionsRepository,
          useValue: {
            transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(txMock)),
            acquireLocationConfirmLock: jest.fn().mockResolvedValue(undefined),
            findLocationsByTenant,
            upsertLocation,
            attachUserToLocation: jest.fn().mockResolvedValue(undefined),
          },
        },
        { provide: ReviewSyncRepository, useValue: { acquireSyncRun, findRunningRunForLocation } },
      ],
    }).compile();

    service = moduleRef.get(ConnectionsDbService);
  });

  it('reports the run that is genuinely still blocking, reading it through the open transaction', async () => {
    const blocking = runRow({ id: 'scheduled-run', trigger: SyncTrigger.SCHEDULED });
    acquireSyncRun.mockRejectedValue(uniqueViolation());
    findRunningRunForLocation.mockResolvedValue(blocking);

    const [result] = await confirmOne();

    expect(result?.backfillAlreadyRunning).toBe(true);
    expect(result?.backfill?.id).toBe('scheduled-run');
    // Through `tx`, not a second pooled connection: the outer transaction still holds this tenant's
    // advisory lock.
    expect(findRunningRunForLocation).toHaveBeenCalledWith('location-locations/1', txMock);
  });

  /**
   * Regression: the blocking run can finish between the violation and the follow-up read; that was
   * reported as `backfillAlreadyRunning: true`, so the caller skipped enqueuing and the location
   * was never backfilled or polled.
   */
  it('takes the now-free index instead of reporting a backfill that is not running', async () => {
    acquireSyncRun
      .mockRejectedValueOnce(uniqueViolation())
      .mockResolvedValueOnce(runRow({ id: 'run-after-retry' }));
    findRunningRunForLocation.mockResolvedValue(null);

    const [result] = await confirmOne();

    expect(result?.backfillAlreadyRunning).toBe(false);
    expect(result?.backfill?.id).toBe('run-after-retry');
    expect(acquireSyncRun).toHaveBeenCalledTimes(2);
  });
});

/**
 * Regression: `disconnect()` does not touch `sync_runs` and reactivation never re-queues a finished
 * backfill, so a location disconnected mid-backfill reactivated with no path to a fresh run (the
 * frontend polled the old row forever).
 */
describe('ConnectionsDbService.restartIncompleteBackfills', () => {
  let service: ConnectionsDbService;
  const acquireSyncRun = jest.fn();
  const findRunningRunForLocation = jest.fn();

  const txMock = {
    transaction: jest.fn(async (fn: (nested: unknown) => Promise<unknown>) => fn({})),
  };

  function completedLocation(): LocationRow {
    return {
      ...locationRow('locations/1'),
      onboardingBackfillCompletedAt: '2026-01-01T00:00:00.000Z',
    };
  }

  function incompleteLocation(externalLocationId = 'locations/2'): LocationRow {
    return { ...locationRow(externalLocationId), onboardingBackfillCompletedAt: null };
  }

  beforeEach(async () => {
    jest.clearAllMocks();

    acquireSyncRun.mockResolvedValue({
      id: 'run-restarted',
      tenantId: 'tenant-1',
      locationId: 'location-locations/2',
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
          },
        },
        { provide: ReviewSyncRepository, useValue: { acquireSyncRun, findRunningRunForLocation } },
      ],
    }).compile();

    service = moduleRef.get(ConnectionsDbService);
  });

  it('acquires a fresh backfill run only for locations that never finished one', async () => {
    const results = await service.restartIncompleteBackfills({
      tenantId: 'tenant-1',
      locations: [completedLocation(), incompleteLocation()],
    });

    expect(results).toHaveLength(1);
    expect(results[0]?.location.externalLocationId).toBe('locations/2');
    expect(acquireSyncRun).toHaveBeenCalledTimes(1);
    expect(acquireSyncRun).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ tenantId: 'tenant-1', locationId: 'location-locations/2' })
    );
  });

  it('does nothing, not even opening a transaction, when every reactivated location already finished', async () => {
    const results = await service.restartIncompleteBackfills({
      tenantId: 'tenant-1',
      locations: [completedLocation()],
    });

    expect(results).toEqual([]);
    expect(acquireSyncRun).not.toHaveBeenCalled();
  });

  it('leaves a genuinely still-running backfill alone instead of duplicating it', async () => {
    const blocking = {
      id: 'run-still-live',
      tenantId: 'tenant-1',
      locationId: 'location-locations/2',
      trigger: SyncTrigger.BACKFILL,
      startedAt: '2026-01-01T00:00:00.000Z',
      completedAt: null,
      status: SyncRunStatus.RUNNING,
      reviewsFetched: 12,
      reviewsTotal: null,
      errorMessage: null,
      updatedAt: '2026-01-01T00:05:00.000Z',
    };
    const uniqueViolation = Object.assign(
      new Error('duplicate key value violates unique constraint'),
      { code: '23505', constraint: 'idx_sync_runs_location_id_running' }
    );
    acquireSyncRun.mockRejectedValue(uniqueViolation);
    findRunningRunForLocation.mockResolvedValue(blocking);

    const [result] = await service.restartIncompleteBackfills({
      tenantId: 'tenant-1',
      locations: [incompleteLocation()],
    });

    expect(result?.backfillAlreadyRunning).toBe(true);
    expect(result?.backfill?.id).toBe('run-still-live');
  });
});
