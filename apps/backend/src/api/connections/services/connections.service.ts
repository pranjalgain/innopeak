import type { AuthUser } from '@auth/types/auth.type';
import { requireTenantUser } from '@auth/utils/require-tenant-user.util';
import { BillingEntitlementsService } from '@billing/services/billing-entitlements.service';
import { MESSAGES } from '@common/constants/messages.constants';
import { LocationStatus } from '@common/enums/location-status.enum';
import { ReviewProviderConnectionStatus } from '@common/enums/review-provider-connection-status.enum';
import { SyncRunStatus } from '@common/enums/sync-run-status.enum';
import { EnvConfig } from '@config/env.config';
import { AuthDbService } from '@db/repositories/auth/auth.db-service';
import {
  ConnectionsDbService,
  LocationLimitExceededError,
} from '@db/repositories/connections/connections.db-service';
import type {
  ConfirmLocationResult,
  LocationRow,
  ProviderConnectionRow,
} from '@db/repositories/connections/types/connections.type';
import { ReviewSyncDbService } from '@db/repositories/review-sync/review-sync.db-service';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GOOGLE_OAUTH } from '@review-provider/constants/review-provider.constants';
import {
  ProviderAuthError,
  ProviderNotConfiguredError,
} from '@review-provider/errors/provider.error';
import { ProviderCredentialService } from '@review-provider/provider-credential.service';
import { ReviewProvider } from '@review-provider/providers/review-provider.provider';
import { ReviewSyncQueue } from '@review-sync-queue/review-sync.queue';

import { OAuthStateService } from './oauth-state.service';

import {
  DEFAULT_RETURN_TO,
  OAUTH_ERROR_CODES,
  type OAuthErrorCode,
  RETURN_TO_PATHS,
} from '../constants/connections.constants';
import type {
  AvailableLocationsResponseDto,
  ConfirmLocationsResponseDto,
  ConnectionStatusResponseDto,
  DisconnectResponseDto,
  LocationDto,
  LocationListResponseDto,
} from '../dto/connection-response.dto';
import { ConnectionState } from '../enums/connection-state.enum';
import { ReturnTo } from '../enums/return-to.enum';
import {
  BackfillEnqueueFailedException,
  ConnectionNeedsReauthException,
  ConnectionNotFoundException,
  ExternalLocationNotFoundException,
  LocationInactiveException,
  LocationLimitReachedException,
  LocationNotFoundException,
  ProviderNotConfiguredException,
  ProviderUnavailableException,
} from '../exceptions/connections.exceptions';
import type { AuthorizeResult, CallbackInput } from '../types/connections.type';
import { hasRequiredOAuthScope, toLocationDto } from '../utils/connections.utils';

@Injectable()
export class ConnectionsService {
  private readonly logger = new Logger(ConnectionsService.name);
  private readonly frontendUrl: string;

  constructor(
    private readonly provider: ReviewProvider,
    private readonly credentialService: ProviderCredentialService,
    private readonly connectionsDbService: ConnectionsDbService,
    private readonly oauthStateService: OAuthStateService,
    private readonly reviewSyncQueue: ReviewSyncQueue,
    private readonly reviewSyncDbService: ReviewSyncDbService,
    private readonly authDbService: AuthDbService,
    private readonly billingEntitlementsService: BillingEntitlementsService,
    configService: ConfigService<EnvConfig>
  ) {
    this.frontendUrl = (configService.get<string>('FRONTEND_URL') ?? '').replace(/\/$/, '');
  }

  /**
   * "Not connected" is a 200 with `connected: false`, never a 404. It is the normal state of every
   * tenant between signup and onboarding, and a guard that has to treat 404 as success is a guard
   * that will eventually treat a real 404 as success too.
   */
  async getConnectionStatus(user: AuthUser): Promise<ConnectionStatusResponseDto> {
    const tenantUser = requireTenantUser(user);
    const tenantId = tenantUser.tenantId;
    const connection = await this.connectionsDbService.findConnectionByTenant(tenantId);

    // A soft-disconnected row (`disconnected_at` set) survives forever so a same-account reconnect
    // can upsert onto it, but its stored credential was revoked at disconnect time — it is not
    // usable and must not be reported as "there is a connection here" to any caller. Without this,
    // the onboarding connect flow's resume logic (which distinguishes "never connected" from
    // "connected, awaiting location confirmation" by `connectionId` presence) mistook a genuinely
    // disconnected tenant for the latter and tried to list available locations against dead
    // credentials, which always fails.
    if (connection?.disconnectedAt !== null) {
      return {
        connected: false,
        status: ConnectionState.DISCONNECTED,
        connection: null,
        location: null,
      };
    }

    const activeLocations = await this.connectionsDbService.findLocationsByTenant(
      tenantId,
      LocationStatus.ACTIVE
    );

    // The tenant's chosen business (`SetActiveLocationDto`, owner-only) wins when it's still
    // active; otherwise — never chosen yet, or the chosen location was deactivated since — fall
    // back to the first active location, same as before this column existed.
    const selectedLocationId = await this.authDbService.findActiveLocationId(tenantId);
    const activeLocation =
      activeLocations.find(location => location.id === selectedLocationId) ?? activeLocations[0];

    // Both halves are required. `google_connection_status` has no `disconnected` value, so a
    // disconnected tenant is one whose locations are all inactive — checking connectionStatus
    // alone would report a disconnected tenant as connected.
    const connected =
      connection.status === ReviewProviderConnectionStatus.ACTIVE && Boolean(activeLocation);

    return {
      connected,
      status: connected ? ConnectionState.CONNECTED : ConnectionState.DISCONNECTED,
      connection: {
        id: connection.id,
        provider: connection.provider,
        providerAccountId: connection.providerAccountId,
        connectionStatus: connection.status,
        tokenExpiresAt: connection.tokenExpiresAt,
        connectedByUserId: connection.connectedByUserId,
        connectedAt: connection.createdAt,
      },
      location: activeLocation
        ? {
            id: activeLocation.id,
            provider: activeLocation.provider,
            externalLocationId: activeLocation.externalLocationId,
            businessName: activeLocation.name,
            address: activeLocation.address,
            status: activeLocation.status,
            lastSyncedAt: activeLocation.lastSyncedAt,
            lastSyncStatus: activeLocation.lastSyncStatus,
            lastSyncError: activeLocation.lastSyncError,
            onboardingBackfillCompletedAt: activeLocation.onboardingBackfillCompletedAt,
          }
        : null,
    };
  }

  async buildAuthorizeRedirect(input: {
    user: AuthUser;
    returnTo: ReturnTo;
  }): Promise<AuthorizeResult> {
    const tenantUser = requireTenantUser(input.user);
    const { state, sid } = await this.oauthStateService.mint({
      tenantId: tenantUser.tenantId,
      userId: tenantUser.id,
      returnTo: input.returnTo,
    });

    try {
      return { authorizationUrl: this.provider.buildAuthorizationUrl(state), sid };
    } catch (error) {
      if (error instanceof ProviderNotConfiguredError) {
        // 503, not 500: the server is fine, this integration just isn't set up. Distinguishing
        // them is what tells an operator to check env vars rather than read a stack trace.
        throw new ProviderNotConfiguredException();
      }
      throw error;
    }
  }

  /**
   * Every outcome is a 302 with `?error=`, never a JSON body — the user is inside a browser
   * navigation, so a JSON error paints as a document.
   *
   * Order matters and is deliberate: `state` is verified and consumed **before** `code` is
   * exchanged. Exchanging first would burn a real authorization code (and, with Google, create a
   * grant) on a request we are about to reject.
   */
  async handleCallback(input: CallbackInput): Promise<string> {
    // Google sends `error` instead of `code` when consent fails. `access_denied` is the owner
    // clicking Cancel — an ordinary outcome, not a fault, and worth its own code so the UI can say
    // "you cancelled" rather than "something went wrong".
    if (input.error) {
      const code =
        input.error === 'access_denied'
          ? OAUTH_ERROR_CODES.ACCESS_DENIED
          : OAUTH_ERROR_CODES.PROVIDER_ERROR;
      return this.redirectWithError(DEFAULT_RETURN_TO, code);
    }

    const consumed = await this.oauthStateService.consume(input.state, input.sid);

    if (!consumed.ok) {
      return this.redirectWithError(DEFAULT_RETURN_TO, OAUTH_ERROR_CODES.INVALID_STATE);
    }

    const { record } = consumed;

    if (!input.code) {
      return this.redirectWithError(record.returnTo, OAUTH_ERROR_CODES.ACCESS_DENIED);
    }

    try {
      const { tokens, account } = await this.provider.exchangeCode(input.code);

      // Read directly off the token response. `business.manage` is the only scope these APIs
      // gate on, and Google lets a user untick it at the consent screen — the grant then succeeds
      // and produces a connection that authorizes but cannot read a single review. Catching it
      // here names the actual problem instead of surfacing a 403 later as "reconnect".
      if (!hasRequiredOAuthScope(tokens.scope)) {
        this.logger.warn(
          `Tenant ${record.tenantId} granted scopes [${tokens.scope ?? ''}] without ${GOOGLE_OAUTH.SCOPES.join(' ')}.`
        );
        return this.redirectWithError(record.returnTo, OAUTH_ERROR_CODES.INSUFFICIENT_SCOPE);
      }

      const existing = await this.connectionsDbService.findConnectionByTenant(record.tenantId);
      const sameAccount = existing?.providerAccountId === account.externalAccountId;

      // A *live* connection to a different Google account is a mismatch: a naive upsert would
      // insert a second connection row and silently break MVP's one-active-connection rule.
      // A *disconnected* one is not — the owner explicitly ended it, and reconnecting with another
      // account is exactly what the error copy tells them to do. The old row stays as an inactive
      // record so its locations and review history survive; `findConnectionByTenant` prefers the
      // live row from here on.
      if (existing && !sameAccount && existing.disconnectedAt === null) {
        this.logger.warn(
          `Tenant ${record.tenantId} completed consent as ${account.externalAccountId} but is already connected to ${existing.providerAccountId}.`
        );
        return this.redirectWithError(record.returnTo, OAUTH_ERROR_CODES.ACCOUNT_MISMATCH);
      }

      // Same account reconnecting: reuse its secret slot rather than orphaning the old one. A new
      // account gets its own — the old credential belongs to the old row and is revoked on
      // disconnect.
      const credentialReference =
        existing && sameAccount
          ? await this.replaceExistingCredential(existing.credentialReference, tokens)
          : await this.credentialService.storeNewCredential(tokens);

      const connection = await this.connectionsDbService.upsertConnection({
        tenantId: record.tenantId,
        connectedByUserId: record.userId,
        providerAccountId: account.externalAccountId,
        credentialReference,
        tokenExpiresAt: tokens.expiresAt,
      });

      // Same-account reconnect only: a brand-new connection (`existing` was null) has no prior
      // locations to reactivate. `upsertConnection` reuses the same row (upserted on
      // `(tenant_id, provider, provider_account_id)`), so `connection.id` here is
      // `existing.id` — this call reverses exactly what `disconnect()` flipped. A location that
      // already finished its backfill is left alone (see `ConnectionsRepository.reactivateLocationsForConnection`);
      // one that hadn't gets a fresh backfill restarted below.
      if (existing && sameAccount) {
        const reactivated = await this.connectionsDbService.reactivateLocationsForConnection(
          connection.id
        );
        await this.restartBackfillsForReactivatedLocations(
          record.tenantId,
          reactivated,
          connection
        );
      }

      return this.redirectWithSuccess(record.returnTo);
    } catch (error) {
      this.logger.error(
        `OAuth callback failed for tenant ${record.tenantId}: ${(error as Error).message}`
      );

      const code: OAuthErrorCode =
        error instanceof ProviderAuthError
          ? OAUTH_ERROR_CODES.INSUFFICIENT_SCOPE
          : OAUTH_ERROR_CODES.PROVIDER_ERROR;

      return this.redirectWithError(record.returnTo, code);
    }
  }

  async listAvailableLocations(user: AuthUser): Promise<AvailableLocationsResponseDto> {
    const tenantId = requireTenantUser(user).tenantId;
    const connection = await this.requireConnection(tenantId);
    const providerLocations = await this.callProvider(connection, accessToken =>
      this.provider.listLocations(accessToken, connection.providerAccountId)
    );

    const persisted = await this.connectionsDbService.findLocationsByTenant(tenantId);
    const persistedIds = new Set(persisted.map(location => location.externalLocationId));

    return {
      provider: connection.provider,
      connectionId: connection.id,
      locations: providerLocations.map(location => ({
        externalLocationId: location.externalLocationId,
        name: location.name,
        address: location.address,
        alreadyConnected: persistedIds.has(location.externalLocationId),
      })),
    };
  }

  async listLocations(input: {
    user: AuthUser;
    status?: LocationStatus | undefined;
  }): Promise<LocationListResponseDto> {
    // Only `.id` is read below, which exists on every AuthUser variant — but `user_locations` is
    // a tenant-user table, so a platform admin's id would just look up nothing. Narrowing here
    // keeps that failure a clear 403 instead of a silently empty list.
    const tenantUser = requireTenantUser(input.user);
    const locations = await this.connectionsDbService.findLocationsForUser(
      tenantUser.id,
      input.status
    );

    return { locations: locations.map(location => toLocationDto(location)) };
  }

  /**
   * Confirms every location the tenant selected, then enqueues each backfill **after** the
   * transaction commits — BullMQ and Postgres share no transaction, so publishing inside it lets
   * a worker dequeue a syncRunId for an uncommitted row, find nothing, and fail the run.
   */
  async confirmLocations(input: {
    user: AuthUser;
    externalLocationIds: string[];
  }): Promise<ConfirmLocationsResponseDto> {
    const tenantUser = requireTenantUser(input.user);
    const connection = await this.requireConnection(tenantUser.tenantId);

    // Re-validated against the provider rather than trusted from the body. An arbitrary id would
    // otherwise create a locations row that no poll can ever resolve — a tenant permanently stuck
    // "connected" to a location Google has never heard of.
    const providerLocations = await this.callProvider(connection, accessToken =>
      this.provider.listLocations(accessToken, connection.providerAccountId)
    );
    const providerLocationsById = new Map(
      providerLocations.map(location => [location.externalLocationId, location])
    );

    const matches = input.externalLocationIds.map(externalLocationId => {
      const match = providerLocationsById.get(externalLocationId);
      if (!match) {
        throw new ExternalLocationNotFoundException();
      }
      return match;
    });

    await this.assertLocationLimit(
      tenantUser.tenantId,
      matches.map(match => match.externalLocationId)
    );

    // The authoritative, lock-held recheck (`ConnectionsDbService.confirmLocations`'s own doc
    // comment) needs the tenant's real plan cap, not the old flat `MAX_ACTIVE_LOCATIONS` sanity
    // ceiling — `null` (unlimited, Paid) becomes `Number.MAX_SAFE_INTEGER` since the recheck's
    // `maxActiveLocations` parameter is a plain number.
    const entitlements = await this.billingEntitlementsService.getEntitlements(tenantUser.tenantId);
    const maxActiveLocations = entitlements.maxLocations ?? Number.MAX_SAFE_INTEGER;

    let results: ConfirmLocationResult[];
    try {
      results = await this.connectionsDbService.confirmLocations({
        tenantId: tenantUser.tenantId,
        userId: tenantUser.id,
        connection,
        locations: matches.map(match => ({
          externalLocationId: match.externalLocationId,
          name: match.name,
          address: match.address,
        })),
        maxActiveLocations,
      });
    } catch (error) {
      // The pre-check above already rejected the common case; this is the race-safe backstop —
      // see `ConnectionsDbService.confirmLocations`. Same response either way, so the caller
      // cannot tell which one fired.
      if (error instanceof LocationLimitExceededError) {
        throw new LocationLimitReachedException();
      }
      throw error;
    }

    // Every location gets its enqueue attempted, even after one fails. `enqueueBackfill`
    // compensates only its *own* sync run before throwing, so bailing out on the first failure
    // would leave every later location holding a committed `running` row with no job published
    // and nothing to compensate it — the exact "stuck running forever, blocks all future
    // confirms" state that compensation exists to prevent, just moved from one location to the
    // rest of the batch. The first failure is re-thrown once they have all had their turn, so the
    // caller still learns this attempt did not fully succeed.
    let enqueueFailure: Error | undefined;
    for (const result of results) {
      try {
        await this.enqueueBackfill(result, connection);
      } catch (error) {
        // `enqueueBackfill` turns a queue failure into a ServiceUnavailableException itself, so
        // this is an Error on every realistic path; the coercion just keeps the rethrow honest.
        enqueueFailure ??= error instanceof Error ? error : new Error(String(error));
      }
    }
    if (enqueueFailure) {
      throw enqueueFailure;
    }

    return {
      locations: results.map(result => ({
        ...toLocationDto(result.location),
        backfill: result.backfill
          ? {
              syncRunId: result.backfill.id,
              status: result.backfill.status,
              // The run's own trigger, not a hardcoded BACKFILL. When a run was already in
              // flight this is whatever was blocking the index — most often the 15-minute
              // `scheduled` sync on an already-live location — and reporting that as a backfill
              // described the wrong job to anyone reading the response or the Swagger contract.
              trigger: result.backfill.trigger,
              startedAt: result.backfill.startedAt,
            }
          : null,
        backfillAlreadyRunning: result.backfillAlreadyRunning,
      })),
    };
  }

  /**
   * The tenant-wide "currently viewing" business (`tenants.active_location_id`). Restricted to an
   * owner at the controller (`@Roles(OWNER)`) — this is the authoritative check, not a database
   * constraint, same as `confirmLocation`'s own limit. The location must belong to this tenant
   * and be active: neither another tenant's id nor a deactivated location may become the shared
   * selection every member's dashboard reads.
   */
  async setActiveLocation(input: { user: AuthUser; locationId: string }): Promise<LocationDto> {
    const tenantId = requireTenantUser(input.user).tenantId;
    const location = await this.connectionsDbService.findLocationForTenant(
      input.locationId,
      tenantId
    );

    if (!location) {
      throw new LocationNotFoundException();
    }

    if (location.status !== LocationStatus.ACTIVE) {
      throw new LocationInactiveException();
    }

    await this.authDbService.setActiveLocationId({ tenantId, locationId: location.id });

    return toLocationDto(location);
  }

  /**
   * Deliberately NOT `requireConnection()`: that helper rejects a `needs_reauth` connection with a
   * 409 "reconnect first", which is right for reads that need a working credential and wrong here
   * — a dead grant is precisely the state in which an owner most wants to disconnect, and telling
   * them to repair it before they may remove it is a dead end.
   */
  async disconnect(user: AuthUser): Promise<DisconnectResponseDto> {
    const tenantId = requireTenantUser(user).tenantId;
    const connection = await this.connectionsDbService.findConnectionByTenant(tenantId);

    if (connection?.disconnectedAt !== null) {
      throw new ConnectionNotFoundException();
    }

    const { deactivatedLocationIds } = await this.connectionsDbService.disconnect(connection.id);

    // Every location this pointed at is now inactive, so leaving it set leaves `tenants` naming a
    // business the tenant no longer has. Nothing breaks today — `getConnectionStatus` is its only
    // reader and falls back to the first active location — but a reconnect that confirms a
    // different set of locations would otherwise inherit a pointer into the old, deactivated one.
    await this.authDbService.setActiveLocationId({ tenantId, locationId: null });

    const credentialRevoked = await this.credentialService.revokeAndDelete(
      connection.credentialReference
    );

    return {
      provider: connection.provider,
      deactivatedLocationIds,
      credentialRevoked,
      pollingStopped: true,
    };
  }

  /**
   * Publishing after the transaction commits (see `confirmLocation`) means a publish failure
   * cannot be rolled back with the insert that created `result.backfill` — that row is already
   * live in Postgres, holding `UNIQUE (location_id) WHERE status = 'running'`.
   *
   * Left uncompensated, a BullMQ/Redis blip here stranded the run in `running` forever: nothing
   * would ever process it (it was never published), and the unique index then rejected every
   * future confirm attempt for the location with "already running" — permanently blocking the one
   * thing PLAN.md §8.2 gates the whole live pipeline on, for a tenant who did nothing wrong.
   *
   * On failure, the run is immediately flipped to `error` (the same CAS `completeRun` uses
   * elsewhere) so that a retried confirm's own `acquireSyncRun` insert has nothing blocking it and
   * starts a genuinely fresh run — rather than trying to detect and republish against this one,
   * which would need tracking "has a job" state this schema has no column for. The exception is
   * rethrown so the HTTP caller — and the frontend — learn this attempt did not fully succeed,
   * instead of a 201 promising a live import that will never run.
   */
  private async enqueueBackfill(
    result: ConfirmLocationResult,
    connection: ProviderConnectionRow
  ): Promise<void> {
    if (result.backfillAlreadyRunning || !result.backfill) {
      return;
    }

    try {
      await this.reviewSyncQueue.addBackfillJob({
        tenantId: result.location.tenantId,
        locationId: result.location.id,
        syncRunId: result.backfill.id,
        connectionId: connection.id,
        externalAccountId: connection.providerAccountId,
        externalLocationId: result.location.externalLocationId,
      });
    } catch (error) {
      const internalMessage = `Failed to publish backfill job: ${(error as Error).message}`;
      this.logger.error(
        `Compensating sync run ${result.backfill.id} for location ${result.location.id}: ${internalMessage}`
      );
      // `MESSAGES.CONNECTIONS.BACKFILL_ENQUEUE_FAILED`, not `internalMessage`: this run's
      // `error_message` is copied verbatim into `locations.last_sync_error` (`completeRun` ->
      // `updateSyncSnapshot`), which `ConnectionsSyncService.getSyncHealth` later returns to the
      // tenant owner as-is. The 503 thrown below already knows not to hand a raw BullMQ/Redis
      // message to a caller — persisting the same raw message here would just leak it one request
      // later instead. A `MESSAGES` tag renders through `renderNestedMessage` wherever it
      // eventually surfaces, so this stays properly localized on that later read too.
      await this.reviewSyncDbService.completeRun({
        syncRunId: result.backfill.id,
        locationId: result.location.id,
        status: SyncRunStatus.ERROR,
        errorMessage: MESSAGES.CONNECTIONS.BACKFILL_ENQUEUE_FAILED,
        markBackfillComplete: false,
        lastReviewSyncedAt: null,
      });

      // 503, not the raw queue error: the location and user_location writes already committed
      // (confirmLocation's transaction), so this is "try again", not "the whole request failed" —
      // and the caller must not read a raw BullMQ/Redis message as something to show an owner.
      throw new BackfillEnqueueFailedException();
    }
  }

  /**
   * Restarts a fresh backfill for any reactivated location that never finished one before the
   * owner disconnected — see `ConnectionsDbService.restartIncompleteBackfills`'s own doc comment
   * for the "stuck on the backfill page forever after reconnect" failure this closes. Failures
   * here are logged and swallowed rather than failing the whole reconnect: the connection and
   * location reactivation already committed by this point, and `enqueueBackfill` has already
   * recorded any failure on the sync run itself (same per-location tolerance as `confirmLocations`
   * below) — so the owner lands on the app and sees a normal, retryable backfill-failed state
   * instead of being told reconnecting itself failed when it didn't.
   */
  private async restartBackfillsForReactivatedLocations(
    tenantId: string,
    reactivatedLocations: LocationRow[],
    connection: ProviderConnectionRow
  ): Promise<void> {
    if (reactivatedLocations.length === 0) {
      return;
    }

    try {
      const restarted = await this.connectionsDbService.restartIncompleteBackfills({
        tenantId,
        locations: reactivatedLocations,
      });

      // Every location gets its enqueue attempted, even after one fails — same reasoning as the
      // batch loop in `confirmLocations` below, just with the failure logged instead of rethrown
      // (this whole step is best-effort; see this method's own doc comment).
      for (const result of restarted) {
        try {
          await this.enqueueBackfill(result, connection);
        } catch (error) {
          this.logger.error(
            `Failed to restart backfill for location ${result.location.id} after reconnect: ${(error as Error).message}`
          );
        }
      }
    } catch (error) {
      this.logger.error(
        `Failed to restart backfills after reconnect for tenant ${tenantId}: ${(error as Error).message}`
      );
    }
  }

  /**
   * Thin pass-through, but the return value is not necessarily `reference` unchanged —
   * `ProviderCredentialService.replaceCredential` mints a fresh secret and returns *that*
   * reference instead when the old one can no longer be written to (pending deletion from a
   * disconnect within the last 7 days). Whatever it returns is the one that resolves, so it must
   * be what gets persisted onto the connection row.
   */
  private async replaceExistingCredential(
    reference: string,
    tokens: Parameters<ProviderCredentialService['replaceCredential']>[1]
  ): Promise<string> {
    return this.credentialService.replaceCredential(reference, tokens);
  }

  /**
   * The tenant's plan `max_locations` cap (`BillingEntitlementsService.canAddLocation`), not the
   * old hardcoded `MAX_ACTIVE_LOCATIONS` sanity ceiling — see `apps/backend/docs/conventions`'s
   * billing plan for why this moved from a flat constant to a per-plan entitlement. Re-confirming
   * an *already active* location is still explicitly allowed (it doesn't grow the count), since
   * that is what a reconnect does and rejecting it would strand a tenant who lost their grant.
   * Cheap, non-authoritative pre-check — `ConnectionsDbService.confirmLocations` rechecks under an
   * advisory lock before writing (see `confirmLocations` below for how that recheck is also now
   * plan-aware).
   */
  private async assertLocationLimit(
    tenantId: string,
    externalLocationIds: string[]
  ): Promise<void> {
    const active = await this.connectionsDbService.findLocationsByTenant(
      tenantId,
      LocationStatus.ACTIVE
    );
    const activeExternalIds = new Set(active.map(location => location.externalLocationId));
    const newCount = externalLocationIds.filter(id => !activeExternalIds.has(id)).length;

    if (newCount === 0) {
      // Reconfirming only already-active locations never grows the count — allowed unconditionally.
      return;
    }

    if (!(await this.billingEntitlementsService.canAddLocation(tenantId))) {
      throw new LocationLimitReachedException();
    }
  }

  private async requireConnection(tenantId: string): Promise<ProviderConnectionRow> {
    const connection = await this.connectionsDbService.findConnectionByTenant(tenantId);

    if (!connection) {
      throw new ConnectionNotFoundException();
    }

    if (connection.status === ReviewProviderConnectionStatus.NEEDS_REAUTH) {
      throw new ConnectionNeedsReauthException();
    }

    return connection;
  }

  /**
   * Resolves a token, runs the call, and translates provider failures into HTTP the frontend can
   * act on. The auth branch **records** the failure on the connection before reporting it (PLAN.md
   * §8.14) — this is the first place a stale grant surfaces interactively rather than inside a
   * background poll, and reporting without recording would leave every later request rediscovering
   * it from scratch.
   */
  private async callProvider<T>(
    connection: ProviderConnectionRow,
    call: (accessToken: string) => Promise<T>
  ): Promise<T> {
    try {
      const { accessToken, refreshedExpiresAt } = await this.credentialService.resolveAccessToken({
        connectionId: connection.id,
        credentialReference: connection.credentialReference,
        tokenExpiresAt: connection.tokenExpiresAt,
      });

      if (refreshedExpiresAt) {
        await this.connectionsDbService.updateTokenExpiry(connection.id, refreshedExpiresAt);
      }

      return await call(accessToken);
    } catch (error) {
      if (error instanceof ProviderAuthError) {
        await this.connectionsDbService.markNeedsReauth(connection.id);
        throw new ConnectionNeedsReauthException();
      }

      if (error instanceof ProviderNotConfiguredError) {
        throw new ProviderNotConfiguredException();
      }

      // 502, deliberately distinct from the 409 above: a Google outage should offer the owner a
      // retry, not send them through a re-consent that cannot fix anything.
      this.logger.error(`Provider call failed: ${(error as Error).message}`);
      throw new ProviderUnavailableException();
    }
  }

  private redirectWithSuccess(returnTo: ReturnTo): string {
    const path = RETURN_TO_PATHS[returnTo];
    return `${this.frontendUrl}${path}${path.includes('?') ? '&' : '?'}connected=1`;
  }

  private redirectWithError(returnTo: ReturnTo, code: OAuthErrorCode): string {
    const path = RETURN_TO_PATHS[returnTo];
    return `${this.frontendUrl}${path}${path.includes('?') ? '&' : '?'}error=${code}`;
  }
}
