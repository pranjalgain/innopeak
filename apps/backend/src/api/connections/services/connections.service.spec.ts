import { JwtTokenType } from '@auth/enums/jwt-token-type.enum';
import { UserRole } from '@auth/enums/user-role.enum';
import type { TenantAuthUser } from '@auth/types/auth.type';
import { BillingEntitlementsService } from '@billing/services/billing-entitlements.service';
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
import { ProviderAuthError } from '@review-provider/errors/provider.error';
import { ProviderCredentialService } from '@review-provider/provider-credential.service';
import { ReviewProvider } from '@review-provider/providers/review-provider.provider';
import { ReviewSyncQueue } from '@review-sync-queue/review-sync.queue';

import { ConnectionsService } from './connections.service';
import { OAuthStateService } from './oauth-state.service';
import { PendingAccountChoiceService } from './pending-account-choice.service';

import { ConnectionState } from '../enums/connection-state.enum';
import { ReturnTo } from '../enums/return-to.enum';
import {
  AccountChoiceExpiredException,
  AccountMismatchException,
  AccountNotInChoiceException,
  ConnectionNeedsReauthException,
  ConnectionNotFoundException,
  ProviderUnavailableException,
} from '../exceptions/connections.exceptions';

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
  phone: null,
  websiteUri: null,
  detailsRefreshedAt: null,
  reviewsReconciledAt: null,
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
 * BullMQ and Postgres share no transaction, so a publish failure cannot roll back the committed
 * `running` sync run; uncompensated it would block every later confirm via
 * `UNIQUE (location_id) WHERE status = 'running'`.
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
  const canAddLocation = jest.fn();
  const getEntitlements = jest.fn();

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
    canAddLocation.mockResolvedValue(true);
    getEntitlements.mockResolvedValue({ maxLocations: null });

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
        { provide: BillingEntitlementsService, useValue: { canAddLocation, getEntitlements } },
        { provide: PendingAccountChoiceService, useValue: {} },
        { provide: ConfigService, useValue: { get: jest.fn().mockReturnValue('') } },
      ],
    }).compile();

    service = moduleRef.get(ConnectionsService);
  });

  describe('a disconnected connection', () => {
    const disconnected = { ...connection, disconnectedAt: '2026-03-01T00:00:00.000Z' };

    it('is treated as no connection by confirmLocations — it must not re-activate a location against a revoked grant', async () => {
      findConnectionByTenant.mockResolvedValue(disconnected);

      await expect(
        service.confirmLocations({ user, externalLocationIds: ['locations/1'] })
      ).rejects.toBeInstanceOf(ConnectionNotFoundException);
      expect(confirmLocationDb).not.toHaveBeenCalled();
    });

    it('is treated as no connection by listAvailableLocations — no provider call is made', async () => {
      findConnectionByTenant.mockResolvedValue(disconnected);

      await expect(service.listAvailableLocations(user)).rejects.toBeInstanceOf(
        ConnectionNotFoundException
      );
      expect(listLocations).not.toHaveBeenCalled();
    });
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

  /** Regression: a failed enqueue in the multi-location loop threw out of it, stranding later locations with a `running` run and no job. */
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
    addBackfillJob
      .mockRejectedValueOnce(new Error('Redis connection lost'))
      .mockResolvedValue(undefined);

    await expect(
      service.confirmLocations({ user, externalLocationIds: ['locations/1', 'locations/2'] })
    ).rejects.toBeInstanceOf(ServiceUnavailableException);

    expect(addBackfillJob).toHaveBeenCalledTimes(2);
    expect(addBackfillJob).toHaveBeenLastCalledWith(
      expect.objectContaining({ locationId: 'location-2', syncRunId: 'run-2' })
    );
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

  /** Regression: `errorMessage` is persisted to `locations.last_sync_error` and returned later via `getSyncHealth`, so the raw BullMQ/Redis detail must not be stored. */
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

  /** Race-safe backstop: a `LocationLimitExceededError` from the locked recheck must surface as the same 409 as the pre-check, not a 500. */
  it('maps a race-safe LocationLimitExceededError from the DB layer to a 409, not a 500', async () => {
    confirmLocationDb.mockRejectedValue(new LocationLimitExceededError());

    await expect(
      service.confirmLocations({ user, externalLocationIds: ['locations/1'] })
    ).rejects.toBeInstanceOf(ConflictException);

    expect(addBackfillJob).not.toHaveBeenCalled();
  });
});

/** Regression: reconnecting with the same Google account must reactivate the matched location, not leave the tenant showing "not connected". */
describe('ConnectionsService.handleCallback — reconnect reactivates locations', () => {
  let service: ConnectionsService;
  const consume = jest.fn();
  const exchangeCode = jest.fn();
  const findConnectionByTenant = jest.fn();
  const upsertConnection = jest.fn();
  const reactivateLocationsForConnection = jest.fn();
  const restartIncompleteBackfills = jest.fn();
  const replaceCredential = jest.fn();
  const storeNewCredential = jest.fn();
  const addBackfillJob = jest.fn();
  const save = jest.fn();
  const peek = jest.fn();
  const claim = jest.fn();

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
      accounts: [{ externalAccountId: 'accounts/1' }],
    });
    save.mockResolvedValue(undefined);
    upsertConnection.mockResolvedValue(connection);
    replaceCredential.mockResolvedValue('local-redis:secret-1');
    storeNewCredential.mockResolvedValue('local-redis:secret-2');
    // Default to no reactivated locations; only the restart-path test sets its own value.
    reactivateLocationsForConnection.mockResolvedValue([]);
    restartIncompleteBackfills.mockResolvedValue([]);

    const moduleRef = await Test.createTestingModule({
      providers: [
        ConnectionsService,
        { provide: ReviewProvider, useValue: { exchangeCode } },
        { provide: ProviderCredentialService, useValue: { replaceCredential, storeNewCredential } },
        {
          provide: ConnectionsDbService,
          useValue: {
            findConnectionByTenant,
            upsertConnection,
            reactivateLocationsForConnection,
            restartIncompleteBackfills,
          },
        },
        { provide: OAuthStateService, useValue: { consume } },
        { provide: ReviewSyncQueue, useValue: { addBackfillJob } },
        { provide: ReviewSyncDbService, useValue: {} },
        { provide: AuthDbService, useValue: {} },
        { provide: BillingEntitlementsService, useValue: {} },
        { provide: PendingAccountChoiceService, useValue: { save, peek, claim } },
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

  it('restarts a fresh backfill for a reactivated location that never finished one', async () => {
    findConnectionByTenant.mockResolvedValue({
      ...connection,
      disconnectedAt: '2026-01-01T00:00:00.000Z',
    });
    reactivateLocationsForConnection.mockResolvedValue([location]);
    restartIncompleteBackfills.mockResolvedValue([
      { location, backfill: backfillRun, backfillAlreadyRunning: false },
    ]);

    await service.handleCallback({ code: 'auth-code', state: 'state', sid: 'sid' });

    expect(restartIncompleteBackfills).toHaveBeenCalledWith({
      tenantId: 'tenant-1',
      locations: [location],
    });
    expect(addBackfillJob).toHaveBeenCalledWith(
      expect.objectContaining({
        locationId: 'location-1',
        syncRunId: 'run-1',
        connectionId: 'connection-1',
      })
    );
  });

  it('does not fail the reconnect when restarting the backfill fails', async () => {
    findConnectionByTenant.mockResolvedValue({
      ...connection,
      disconnectedAt: '2026-01-01T00:00:00.000Z',
    });
    reactivateLocationsForConnection.mockResolvedValue([location]);
    restartIncompleteBackfills.mockRejectedValue(new Error('db unavailable'));

    const redirect = await service.handleCallback({
      code: 'auth-code',
      state: 'state',
      sid: 'sid',
    });

    // The reconnect already committed; a backfill restart failure must not turn it into an OAuth error redirect.
    expect(redirect).toContain('connected=1');
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

/** Regression: a soft-disconnected connection row (revoked credential) was reported as live, which broke the onboarding resume logic. */
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
        { provide: BillingEntitlementsService, useValue: {} },
        { provide: PendingAccountChoiceService, useValue: {} },
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
    // The early return must short-circuit before either lookup.
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

/** The account picker: a grant that manages several Business Profile accounts waits for the owner to choose. */
describe('ConnectionsService — choosing between several Business Profile accounts', () => {
  let service: ConnectionsService;
  const consume = jest.fn();
  const exchangeCode = jest.fn();
  const findConnectionByTenant = jest.fn();
  const upsertConnection = jest.fn();
  const reactivateLocationsForConnection = jest.fn();
  const replaceCredential = jest.fn();
  const storeNewCredential = jest.fn();
  const save = jest.fn();
  const peek = jest.fn();
  const claim = jest.fn();

  const tokens = {
    accessToken: 'access-token',
    refreshToken: 'refresh-token',
    expiresAt: new Date('2026-01-01T01:00:00.000Z'),
    scope: 'https://www.googleapis.com/auth/business.manage',
  };
  const personal = { externalAccountId: 'accounts/1', name: 'Jane Doe', type: 'PERSONAL' };
  const group = { externalAccountId: 'accounts/2', name: 'Coastal Group', type: 'LOCATION_GROUP' };
  const callbackInput = { code: 'auth-code', state: 'state', sid: 'sid' };

  beforeEach(async () => {
    jest.clearAllMocks();

    consume.mockResolvedValue({
      ok: true,
      record: { tenantId: 'tenant-1', userId: 'user-1', returnTo: ReturnTo.SETTINGS },
    });
    exchangeCode.mockResolvedValue({ tokens, accounts: [personal, group] });
    findConnectionByTenant.mockResolvedValue(null);
    upsertConnection.mockResolvedValue(connection);
    storeNewCredential.mockResolvedValue('local-redis:secret-2');
    replaceCredential.mockResolvedValue('local-redis:secret-1');
    reactivateLocationsForConnection.mockResolvedValue([]);
    save.mockResolvedValue(undefined);

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
        { provide: BillingEntitlementsService, useValue: {} },
        { provide: PendingAccountChoiceService, useValue: { save, peek, claim } },
        { provide: ConfigService, useValue: { get: jest.fn().mockReturnValue('') } },
      ],
    }).compile();

    service = moduleRef.get(ConnectionsService);
  });

  describe('callback', () => {
    it('keeps the grant pending and sends the owner to the picker, connecting nothing yet', async () => {
      const redirect = await service.handleCallback(callbackInput);

      // The picker lives on the onboarding screen; `returnTo` travels with the grant so Settings gets the owner back.
      expect(save).toHaveBeenCalledWith('tenant-1', {
        userId: 'user-1',
        returnTo: ReturnTo.SETTINGS,
        accounts: [personal, group],
        tokens,
      });
      expect(redirect).toContain('/onboarding/connect');
      expect(redirect).toContain('account_choice=pending');
      expect(storeNewCredential).not.toHaveBeenCalled();
      expect(upsertConnection).not.toHaveBeenCalled();
    });

    it('connects straight away, with no picker, when the grant manages one account', async () => {
      exchangeCode.mockResolvedValue({ tokens, accounts: [personal] });

      const redirect = await service.handleCallback(callbackInput);

      expect(save).not.toHaveBeenCalled();
      expect(upsertConnection).toHaveBeenCalledWith(
        expect.objectContaining({ providerAccountId: 'accounts/1' })
      );
      expect(redirect).toContain('connected=1');
    });

    it('reconnects to the account the tenant already has, without asking again', async () => {
      findConnectionByTenant.mockResolvedValue({ ...connection, providerAccountId: 'accounts/2' });

      const redirect = await service.handleCallback(callbackInput);

      expect(save).not.toHaveBeenCalled();
      expect(replaceCredential).toHaveBeenCalled();
      expect(upsertConnection).toHaveBeenCalledWith(
        expect.objectContaining({ providerAccountId: 'accounts/2' })
      );
      expect(redirect).toContain('connected=1');
    });

    // Every choice would be refused while that connection is live, so asking would only waste the grant.
    it('answers ACCOUNT_MISMATCH, without a picker, when the connected account is not among those offered', async () => {
      findConnectionByTenant.mockResolvedValue({ ...connection, providerAccountId: 'accounts/9' });

      const redirect = await service.handleCallback(callbackInput);

      expect(save).not.toHaveBeenCalled();
      expect(storeNewCredential).not.toHaveBeenCalled();
      expect(upsertConnection).not.toHaveBeenCalled();
      expect(redirect).toContain('error=ACCOUNT_MISMATCH');
    });

    it('reads the tenant connection once per callback', async () => {
      exchangeCode.mockResolvedValue({ tokens, accounts: [personal] });

      await service.handleCallback(callbackInput);

      expect(findConnectionByTenant).toHaveBeenCalledTimes(1);
    });

    it('asks again after a disconnect, since the old account no longer binds the owner', async () => {
      findConnectionByTenant.mockResolvedValue({
        ...connection,
        providerAccountId: 'accounts/2',
        disconnectedAt: '2026-01-01T00:00:00.000Z',
      });

      const redirect = await service.handleCallback(callbackInput);

      // The disconnected row's account is still offered, but a disconnected tenant is free to pick another.
      expect(save).toHaveBeenCalled();
      expect(redirect).toContain('account_choice=pending');
    });
  });

  describe('getPendingAccounts', () => {
    it('lists the candidates, with a null for a missing name or type', async () => {
      peek.mockResolvedValue({
        userId: 'user-1',
        accounts: [personal, { externalAccountId: 'accounts/3' }],
        tokens,
      });

      await expect(service.getPendingAccounts(user)).resolves.toEqual({
        accounts: [
          { accountId: 'accounts/1', name: 'Jane Doe', type: 'PERSONAL' },
          { accountId: 'accounts/3', name: null, type: null },
        ],
      });
    });

    it('answers expired when nothing is pending', async () => {
      peek.mockResolvedValue(null);

      await expect(service.getPendingAccounts(user)).rejects.toBeInstanceOf(
        AccountChoiceExpiredException
      );
    });

    it("answers expired for a choice that belongs to another user's consent", async () => {
      peek.mockResolvedValue({ userId: 'someone-else', accounts: [personal], tokens });

      await expect(service.getPendingAccounts(user)).rejects.toBeInstanceOf(
        AccountChoiceExpiredException
      );
    });
  });

  describe('selectAccount', () => {
    const waiting = {
      userId: 'user-1',
      returnTo: ReturnTo.SETTINGS,
      accounts: [personal, group],
      tokens,
    };

    it('connects the chosen account through the same path as a one-account callback', async () => {
      peek.mockResolvedValue(waiting);
      claim.mockResolvedValue(waiting);

      await expect(service.selectAccount({ user, accountId: 'accounts/2' })).resolves.toEqual({
        connectionId: 'connection-1',
        accountId: 'accounts/2',
        returnTo: ReturnTo.SETTINGS,
      });

      expect(storeNewCredential).toHaveBeenCalledWith(tokens);
      expect(upsertConnection).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: 'tenant-1',
          connectedByUserId: 'user-1',
          providerAccountId: 'accounts/2',
        })
      );
    });

    it('refuses an account Google did not offer, and keeps the choice so it can be retried', async () => {
      peek.mockResolvedValue(waiting);

      await expect(
        service.selectAccount({ user, accountId: 'accounts/999' })
      ).rejects.toBeInstanceOf(AccountNotInChoiceException);

      expect(claim).not.toHaveBeenCalled();
      expect(storeNewCredential).not.toHaveBeenCalled();
    });

    it('answers expired when nothing is pending, or it belongs to someone else', async () => {
      peek.mockResolvedValue(null);
      await expect(service.selectAccount({ user, accountId: 'accounts/1' })).rejects.toBeInstanceOf(
        AccountChoiceExpiredException
      );

      peek.mockResolvedValue({ ...waiting, userId: 'someone-else' });
      await expect(service.selectAccount({ user, accountId: 'accounts/1' })).rejects.toBeInstanceOf(
        AccountChoiceExpiredException
      );
      expect(claim).not.toHaveBeenCalled();
    });

    // Regression guard for a double click or a second tab: only the first claim gets the tokens.
    it('is single-use: a submission that loses the claim race connects nothing', async () => {
      peek.mockResolvedValue(waiting);
      claim.mockResolvedValue(null);

      await expect(service.selectAccount({ user, accountId: 'accounts/1' })).rejects.toBeInstanceOf(
        AccountChoiceExpiredException
      );
      expect(storeNewCredential).not.toHaveBeenCalled();
      expect(upsertConnection).not.toHaveBeenCalled();
    });

    it('applies the mismatch rule: a live connection to another account is a 409', async () => {
      peek.mockResolvedValue(waiting);
      claim.mockResolvedValue(waiting);
      findConnectionByTenant.mockResolvedValue({ ...connection, providerAccountId: 'accounts/9' });

      await expect(service.selectAccount({ user, accountId: 'accounts/2' })).rejects.toBeInstanceOf(
        AccountMismatchException
      );
      expect(upsertConnection).not.toHaveBeenCalled();
    });

    // Regression: the grant was claimed before connecting, so a transient failure lost it and "Try again" could not work.
    it('puts the grant back and answers 502 when connecting fails, so the owner can try again', async () => {
      peek.mockResolvedValue(waiting);
      claim.mockResolvedValue(waiting);
      storeNewCredential.mockRejectedValue(new Error('secrets store unavailable'));

      await expect(service.selectAccount({ user, accountId: 'accounts/2' })).rejects.toBeInstanceOf(
        ProviderUnavailableException
      );
      expect(save).toHaveBeenCalledWith('tenant-1', waiting);
      expect(upsertConnection).not.toHaveBeenCalled();
    });

    it('passes an already-mapped HTTP error through, after putting the grant back', async () => {
      peek.mockResolvedValue(waiting);
      claim.mockResolvedValue(waiting);
      upsertConnection.mockRejectedValue(new ServiceUnavailableException());

      await expect(service.selectAccount({ user, accountId: 'accounts/2' })).rejects.toBeInstanceOf(
        ServiceUnavailableException
      );
      expect(save).toHaveBeenCalledWith('tenant-1', waiting);
    });

    it('drops a grant Google rejects and asks for a fresh consent', async () => {
      peek.mockResolvedValue(waiting);
      claim.mockResolvedValue(waiting);
      storeNewCredential.mockRejectedValue(new ProviderAuthError('invalid_grant'));

      await expect(service.selectAccount({ user, accountId: 'accounts/2' })).rejects.toBeInstanceOf(
        ConnectionNeedsReauthException
      );
      expect(save).not.toHaveBeenCalled();
    });

    it('reactivates locations when the chosen account is the one being reconnected', async () => {
      peek.mockResolvedValue(waiting);
      claim.mockResolvedValue(waiting);
      findConnectionByTenant.mockResolvedValue({
        ...connection,
        providerAccountId: 'accounts/2',
        disconnectedAt: '2026-01-01T00:00:00.000Z',
      });

      await service.selectAccount({ user, accountId: 'accounts/2' });

      expect(replaceCredential).toHaveBeenCalledWith('local-redis:secret-1', tokens);
      expect(reactivateLocationsForConnection).toHaveBeenCalledWith('connection-1');
    });
  });
});
