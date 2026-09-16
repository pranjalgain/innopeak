import { JwtTokenType } from '@auth/enums/jwt-token-type.enum';
import { UserRole } from '@auth/enums/user-role.enum';
import type { TenantAuthUser } from '@auth/types/auth-user.type';
import { MESSAGES } from '@common/constants/messages.constants';
import { LocationStatus } from '@common/enums/location-status.enum';
import { ReviewProviderConnectionStatus } from '@common/enums/review-provider-connection-status.enum';
import { ReviewProvider as ReviewProviderKey } from '@common/enums/review-provider.enum';
import { SyncRunStatus } from '@common/enums/sync-run-status.enum';
import { SyncTrigger } from '@common/enums/sync-trigger.enum';
import { AuthDbService } from '@db/repositories/auth/auth.db-service';
import {
  ConnectionsDbService,
  LocationLimitExceededError,
} from '@db/repositories/connections/connections.db-service';
import { ReviewSyncDbService } from '@db/repositories/review-sync/review-sync.db-service';
import { ConflictException, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { ProviderCredentialService } from '@review-provider/provider-credential.service';
import { ReviewProvider } from '@review-provider/providers/review-provider.provider';
import { ReviewSyncQueue } from '@review-sync-queue/review-sync.queue';

import { ConnectionsService } from './connections.service';
import { OAuthStateService } from './oauth-state.service';

import { ConnectionState } from '../enums/connection-state.enum';
import { ReturnTo } from '../enums/return-to.enum';

const user: TenantAuthUser = {
  type: JwtTokenType.TENANT_USER,
  id: 'user-1',
  tenantId: 'tenant-1',
  email: 'owner@example.com',
  role: UserRole.OWNER,
  locale: null,
};

const connection = {
  id: 'connection-1',
  tenantId: 'tenant-1',
  connectedByUserId: 'user-1',
  provider: ReviewProviderKey.GOOGLE,
  providerAccountId: 'accounts/1',
  credentialReference: 'local-redis:secret-1',
  tokenExpiresAt: null,
  status: ReviewProviderConnectionStatus.ACTIVE,
  disconnectedAt: null,
  createdAt: '2026-01-01T00:00:00.000Z',
};

const location = {
  id: 'location-1',
  tenantId: 'tenant-1',
  providerConnectionId: 'connection-1',
  provider: ReviewProviderKey.GOOGLE,
  externalLocationId: 'locations/1',
  name: 'The Coffee House',
  address: null,
  status: LocationStatus.ACTIVE,
  lastSyncedAt: null,
  lastSyncStatus: null,
  lastSyncError: null,
  onboardingBackfillCompletedAt: null,
  createdAt: '2026-01-01T00:00:00.000Z',
};

const backfillRun = {
  id: 'run-1',
  tenantId: 'tenant-1',
  locationId: 'location-1',
  trigger: SyncTrigger.BACKFILL,
  startedAt: '2026-01-01T00:00:00.000Z',
  completedAt: null,
  status: SyncRunStatus.RUNNING,
  reviewsFetched: null,
  reviewsTotal: null,
  errorMessage: null,
  updatedAt: '2026-01-01T00:00:00.000Z',
};

/**
 * `confirmLocations`'s job is published only after its own DB transaction has already committed —
 * BullMQ and Postgres share no transaction. A publish failure therefore cannot be rolled back with
 * the insert that already made the sync run `running`, and that row holds
 * `UNIQUE (location_id) WHERE status = 'running'`. Left uncompensated, nothing would ever process
 * that run (it was never enqueued) and the unique index would reject every later confirm attempt
 * for the location, permanently — the tenant would never ingest a single review.
 */
describe('ConnectionsService.confirmLocations — enqueue failure is compensated', () => {
  let service: ConnectionsService;
  const listLocations = jest.fn();
  const resolveAccessToken = jest.fn();
  const findConnectionByTenant = jest.fn();
  const findLocationsByTenant = jest.fn();
  const confirmLocationDb = jest.fn();
  const addBackfillJob = jest.fn();
  const completeRun = jest.fn();

  beforeEach(async () => {
    jest.clearAllMocks();

    findConnectionByTenant.mockResolvedValue(connection);
    findLocationsByTenant.mockResolvedValue([]);
    listLocations.mockResolvedValue([
      { externalLocationId: 'locations/1', name: 'The Coffee House', address: null },
    ]);
    resolveAccessToken.mockResolvedValue({ accessToken: 'token', refreshedExpiresAt: null });
    confirmLocationDb.mockResolvedValue([
      {
        location,
        backfill: backfillRun,
        backfillAlreadyRunning: false,
      },
    ]);
    completeRun.mockResolvedValue(true);

    const moduleRef = await Test.createTestingModule({
      providers: [
        ConnectionsService,
        { provide: ReviewProvider, useValue: { listLocations } },
        { provide: ProviderCredentialService, useValue: { resolveAccessToken } },
        {
          provide: ConnectionsDbService,
          useValue: {
            findConnectionByTenant,
            findLocationsByTenant,
            confirmLocations: confirmLocationDb,
            updateTokenExpiry: jest.fn(),
          },
        },
        { provide: OAuthStateService, useValue: {} },
        { provide: ReviewSyncQueue, useValue: { addBackfillJob } },
        { provide: ReviewSyncDbService, useValue: { completeRun } },
        { provide: AuthDbService, useValue: {} },
        { provide: ConfigService, useValue: { get: jest.fn().mockReturnValue('') } },
      ],
    }).compile();

    service = moduleRef.get(ConnectionsService);
  });

  it('succeeds normally when the job publishes cleanly', async () => {
    addBackfillJob.mockResolvedValue(undefined);

    const result = await service.confirmLocations({
      user,
      externalLocationIds: ['locations/1'],
    });

    expect(result.locations[0]?.backfill?.syncRunId).toBe('run-1');
    expect(completeRun).not.toHaveBeenCalled();
  });

  it('compensates the run to error and answers 503 when the publish throws', async () => {
    addBackfillJob.mockRejectedValue(new Error('Redis connection lost'));

    await expect(
      service.confirmLocations({ user, externalLocationIds: ['locations/1'] })
    ).rejects.toBeInstanceOf(ServiceUnavailableException);

    expect(completeRun).toHaveBeenCalledWith(
      expect.objectContaining({
        syncRunId: 'run-1',
        locationId: 'location-1',
        status: SyncRunStatus.ERROR,
        markBackfillComplete: false,
      })
    );
  });

  /**
   * Regression: the multi-location loop used to `await this.enqueueBackfill(...)` bare, so the
   * first failure threw straight out of the loop. `enqueueBackfill` compensates only its *own*
   * sync run, which left every location after the failing one holding a committed `running` row
   * with no job published and nothing to compensate it — the exact "stuck running forever, which
   * then blocks every future confirm for that location via the partial unique index" state the
   * compensation logic exists to prevent, just relocated from one location to the rest of the batch.
   */
  it('still enqueues (and compensates) the remaining locations after one publish fails', async () => {
    const secondLocation = { ...location, id: 'location-2', externalLocationId: 'locations/2' };
    const secondRun = { ...backfillRun, id: 'run-2', locationId: 'location-2' };
    listLocations.mockResolvedValue([
      { externalLocationId: 'locations/1', name: 'The Coffee House', address: null },
      { externalLocationId: 'locations/2', name: 'The Bakery', address: null },
    ]);
    confirmLocationDb.mockResolvedValue([
      { location, backfill: backfillRun, backfillAlreadyRunning: false },
      { location: secondLocation, backfill: secondRun, backfillAlreadyRunning: false },
    ]);
    // Only the FIRST location's publish fails.
    addBackfillJob
      .mockRejectedValueOnce(new Error('Redis connection lost'))
      .mockResolvedValue(undefined);

    await expect(
      service.confirmLocations({ user, externalLocationIds: ['locations/1', 'locations/2'] })
    ).rejects.toBeInstanceOf(ServiceUnavailableException);

    // The second location must still have had its turn rather than being abandoned mid-loop.
    expect(addBackfillJob).toHaveBeenCalledTimes(2);
    expect(addBackfillJob).toHaveBeenLastCalledWith(
      expect.objectContaining({ locationId: 'location-2', syncRunId: 'run-2' })
    );
    // ...and only the one that actually failed is compensated to `error`.
    expect(completeRun).toHaveBeenCalledTimes(1);
    expect(completeRun).toHaveBeenCalledWith(
      expect.objectContaining({ syncRunId: 'run-1', status: SyncRunStatus.ERROR })
    );
  });

  it('never surfaces the raw queue error message to the caller', async () => {
    addBackfillJob.mockRejectedValue(new Error('ECONNREFUSED 127.0.0.1:6379'));

    let caught: unknown;
    try {
      await service.confirmLocations({ user, externalLocationIds: ['locations/1'] });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(ServiceUnavailableException);
    const body = (caught as ServiceUnavailableException).getResponse() as { message: string };
    expect(body.message).not.toContain('ECONNREFUSED');
  });

  /**
   * Regression: the run's `errorMessage` here is copied verbatim into `locations.last_sync_error`
   * (`completeRun` -> `updateSyncSnapshot`), which `ConnectionsSyncService.getSyncHealth` later
   * returns to the tenant owner as-is — on a *different*, later request than this one, so the 503
   * body being sanitized (asserted above) does not protect it. Persisting the raw error here would
   * leak the same BullMQ/Redis detail this route's own 503 explicitly refuses to hand back.
   */
  it('persists the safe, user-facing message on the run — never the raw queue error text', async () => {
    addBackfillJob.mockRejectedValue(new Error('ECONNREFUSED 127.0.0.1:6379'));

    await expect(
      service.confirmLocations({ user, externalLocationIds: ['locations/1'] })
    ).rejects.toBeInstanceOf(ServiceUnavailableException);

    expect(completeRun).toHaveBeenCalledWith(
      expect.objectContaining({
        errorMessage: MESSAGES.CONNECTIONS.BACKFILL_ENQUEUE_FAILED,
      })
    );
  });

  it('does not attempt to compensate when a run was already active (nothing new was enqueued)', async () => {
    confirmLocationDb.mockResolvedValue([
      {
        location,
        backfill: backfillRun,
        backfillAlreadyRunning: true,
      },
    ]);

    await service.confirmLocations({ user, externalLocationIds: ['locations/1'] });

    expect(addBackfillJob).not.toHaveBeenCalled();
    expect(completeRun).not.toHaveBeenCalled();
  });

  /**
   * The race-safe backstop: `ConnectionsDbService.confirmLocations` rechecks the location limit
   * under an advisory lock and throws `LocationLimitExceededError` when two concurrent confirms
   * both passed the cheap pre-check (`assertLocationLimit`, itself exercised via
   * `findLocationsByTenant` returning `[]` in this suite's `beforeEach`). The service must
   * translate that into the same 409 the pre-check throws, not let it escape as a raw 500.
   */
  it('maps a race-safe LocationLimitExceededError from the DB layer to a 409, not a 500', async () => {
    confirmLocationDb.mockRejectedValue(new LocationLimitExceededError());

    await expect(
      service.confirmLocations({ user, externalLocationIds: ['locations/1'] })
    ).rejects.toBeInstanceOf(ConflictException);

    expect(addBackfillJob).not.toHaveBeenCalled();
  });
});

/**
 * `PLAN.md` §8.8 and the API reference both state that reconnecting with the same Google account
 * "reactivates the matched location rather than creating a second one." The write path only ever
 * upserted `review_provider_connections` — nothing touched `locations` — so a tenant who
 * disconnected and reconnected with the same account stayed stuck showing "not connected"
 * (`GET /v1/connections` requires an *active* location) until they repeated the confirm-location
 * step by hand, contradicting the documented behavior.
 */
describe('ConnectionsService.handleCallback — reconnect reactivates locations', () => {
  let service: ConnectionsService;
  const consume = jest.fn();
  const exchangeCode = jest.fn();
  const findConnectionByTenant = jest.fn();
  const upsertConnection = jest.fn();
  const reactivateLocationsForConnection = jest.fn();
  const replaceCredential = jest.fn();
  const storeNewCredential = jest.fn();

  const tokens = {
    accessToken: 'access-token',
    refreshToken: 'refresh-token',
    expiresAt: new Date('2026-01-01T01:00:00.000Z'),
    scope: 'https://www.googleapis.com/auth/business.manage',
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    consume.mockResolvedValue({
      ok: true,
      record: { tenantId: 'tenant-1', userId: 'user-1', returnTo: ReturnTo.ONBOARDING },
    });
    exchangeCode.mockResolvedValue({
      tokens,
      account: { externalAccountId: 'accounts/1' },
    });
    upsertConnection.mockResolvedValue(connection);
    replaceCredential.mockResolvedValue('local-redis:secret-1');
    storeNewCredential.mockResolvedValue('local-redis:secret-2');

    const moduleRef = await Test.createTestingModule({
      providers: [
        ConnectionsService,
        { provide: ReviewProvider, useValue: { exchangeCode } },
        { provide: ProviderCredentialService, useValue: { replaceCredential, storeNewCredential } },
        {
          provide: ConnectionsDbService,
          useValue: { findConnectionByTenant, upsertConnection, reactivateLocationsForConnection },
        },
        { provide: OAuthStateService, useValue: { consume } },
        { provide: ReviewSyncQueue, useValue: {} },
        { provide: ReviewSyncDbService, useValue: {} },
        { provide: AuthDbService, useValue: {} },
        { provide: ConfigService, useValue: { get: jest.fn().mockReturnValue('') } },
      ],
    }).compile();

    service = moduleRef.get(ConnectionsService);
  });

  it('reactivates the tenant’s locations when the same Google account reconnects', async () => {
    findConnectionByTenant.mockResolvedValue({
      ...connection,
      disconnectedAt: '2026-01-01T00:00:00.000Z',
    });

    await service.handleCallback({ code: 'auth-code', state: 'state', sid: 'sid' });

    expect(replaceCredential).toHaveBeenCalledWith('local-redis:secret-1', tokens);
    expect(reactivateLocationsForConnection).toHaveBeenCalledWith('connection-1');
  });

  it('does not reactivate anything on a brand-new connection (no prior row)', async () => {
    findConnectionByTenant.mockResolvedValue(null);

    await service.handleCallback({ code: 'auth-code', state: 'state', sid: 'sid' });

    expect(storeNewCredential).toHaveBeenCalled();
    expect(reactivateLocationsForConnection).not.toHaveBeenCalled();
  });

  it('does not reactivate anything when the reconnect uses a different Google account (creates a new connection)', async () => {
    findConnectionByTenant.mockResolvedValue({
      ...connection,
      providerAccountId: 'accounts/2',
      disconnectedAt: '2026-01-01T00:00:00.000Z',
    });

    await service.handleCallback({ code: 'auth-code', state: 'state', sid: 'sid' });

    expect(storeNewCredential).toHaveBeenCalled();
    expect(reactivateLocationsForConnection).not.toHaveBeenCalled();
  });

  it('does not reactivate anything on an ACCOUNT_MISMATCH (existing live connection, different account)', async () => {
    findConnectionByTenant.mockResolvedValue({
      ...connection,
      providerAccountId: 'accounts/2',
      disconnectedAt: null,
    });

    await service.handleCallback({ code: 'auth-code', state: 'state', sid: 'sid' });

    expect(upsertConnection).not.toHaveBeenCalled();
    expect(reactivateLocationsForConnection).not.toHaveBeenCalled();
  });
});

/**
 * Regression: a soft-disconnected `review_provider_connections` row (`disconnected_at` set)
 * survives forever so a same-account reconnect can upsert onto it — but `findConnectionByTenant`
 * still returns that row when it is the only one for the tenant, and this method used to report it
 * as a live connection (non-null `connection`, exposing its id) purely because `connected` and
 * `connection` were computed independently. The onboarding connect flow's resume logic treats a
 * non-null `connectionId` as "connected, awaiting location confirmation" and calls
 * `listAvailableLocations`, which uses the connection's stored credential — already revoked at
 * disconnect time — and always fails. A disconnected tenant must be indistinguishable from a
 * tenant that never connected at all.
 */
describe('ConnectionsService.getConnectionStatus — soft-disconnected connection', () => {
  let service: ConnectionsService;
  const findConnectionByTenant = jest.fn();
  const findLocationsByTenant = jest.fn();
  const findActiveLocationId = jest.fn();

  beforeEach(async () => {
    jest.clearAllMocks();

    findLocationsByTenant.mockResolvedValue([location]);
    findActiveLocationId.mockResolvedValue(null);

    const moduleRef = await Test.createTestingModule({
      providers: [
        ConnectionsService,
        { provide: ReviewProvider, useValue: {} },
        { provide: ProviderCredentialService, useValue: {} },
        {
          provide: ConnectionsDbService,
          useValue: { findConnectionByTenant, findLocationsByTenant },
        },
        { provide: OAuthStateService, useValue: {} },
        { provide: ReviewSyncQueue, useValue: {} },
        { provide: ReviewSyncDbService, useValue: {} },
        { provide: AuthDbService, useValue: { findActiveLocationId } },
        { provide: ConfigService, useValue: { get: jest.fn().mockReturnValue('') } },
      ],
    }).compile();

    service = moduleRef.get(ConnectionsService);
  });

  it('reports no connection at all for a disconnected tenant, not a connected-but-unconfirmed one', async () => {
    findConnectionByTenant.mockResolvedValue({
      ...connection,
      disconnectedAt: '2026-01-01T00:00:00.000Z',
    });

    const result = await service.getConnectionStatus(user);

    expect(result).toEqual({
      connected: false,
      status: ConnectionState.DISCONNECTED,
      connection: null,
      location: null,
    });
    // Would have used the (revoked) credential behind this connection for nothing — the early
    // return must short-circuit before either lookup.
    expect(findLocationsByTenant).not.toHaveBeenCalled();
    expect(findActiveLocationId).not.toHaveBeenCalled();
  });

  it('still exposes the connection id for a live connection with nothing confirmed yet', async () => {
    findConnectionByTenant.mockResolvedValue({ ...connection, disconnectedAt: null });
    findLocationsByTenant.mockResolvedValue([]);

    const result = await service.getConnectionStatus(user);

    expect(result.connected).toBe(false);
    expect(result.connection?.id).toBe('connection-1');
    expect(result.location).toBeNull();
  });
});
