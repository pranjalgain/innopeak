import type { AuthUser } from '@auth/types/auth-user.type';
import { requireTenantUser } from '@auth/utils/require-tenant-user.util';
import { MESSAGES } from '@common/constants/messages.constants';
import { LocationStatus } from '@common/enums/location-status.enum';
import { ReviewProviderConnectionStatus } from '@common/enums/review-provider-connection-status.enum';
import { SyncRunStatus } from '@common/enums/sync-run-status.enum';
import { SyncTrigger } from '@common/enums/sync-trigger.enum';
import { EnvConfig } from '@config/env.config';
import {
  type ConfirmLocationResult,
  ConnectionsDbService,
  LocationLimitExceededError,
} from '@db/repositories/connections/connections.db-service';
import type {
  LocationRow,
  ProviderConnectionRow,
} from '@db/repositories/connections/connections.repository';
import { ReviewSyncDbService } from '@db/repositories/review-sync/review-sync.db-service';
import {
  BadGatewayException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
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
  CONNECTION_ERROR_CODES,
  DEFAULT_RETURN_TO,
  MAX_ACTIVE_LOCATIONS,
  OAUTH_ERROR_CODES,
  type OAuthErrorCode,
  RETURN_TO_PATHS,
} from '../constants/connections.constants';
import type {
  AvailableLocationsResponseDto,
  ConfirmLocationResponseDto,
  ConnectionStatusResponseDto,
  DisconnectResponseDto,
  LocationDto,
} from '../dto/connection-response.dto';
import { ConnectionState } from '../enums/connection-state.enum';
import { ReturnTo } from '../enums/return-to.enum';

export interface AuthorizeResult {
  authorizationUrl: string;
  /** Set as the browser-binding cookie by the controller. */
  sid: string;
}

export interface CallbackInput {
  code?: string | undefined;
  state?: string | undefined;
  error?: string | undefined;
  sid?: string | undefined;
}

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

    if (!connection) {
      return {
        connected: false,
        status: ConnectionState.DISCONNECTED,
        connection: null,
        location: null,
      };
    }

    const [activeLocation] = await this.connectionsDbService.findLocationsByTenant(
      tenantId,
      LocationStatus.ACTIVE
    );

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
        throw new ServiceUnavailableException({
          message: MESSAGES.CONNECTIONS.PROVIDER_NOT_CONFIGURED,
          code: CONNECTION_ERROR_CODES.PROVIDER_NOT_CONFIGURED,
        });
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
      if (!this.hasRequiredScope(tokens.scope)) {
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
      // `existing.id` — this call reverses exactly what `disconnect()` flipped, without
      // re-triggering a backfill (see `ConnectionsRepository.reactivateLocationsForConnection`).
      if (existing && sameAccount) {
        await this.connectionsDbService.reactivateLocationsForConnection(connection.id);
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
  }): Promise<LocationDto[]> {
    // Only `.id` is read below, which exists on every AuthUser variant — but `user_locations` is
    // a tenant-user table, so a platform admin's id would just look up nothing. Narrowing here
    // keeps that failure a clear 403 instead of a silently empty list.
    const tenantUser = requireTenantUser(input.user);
    const locations = await this.connectionsDbService.findLocationsForUser(
      tenantUser.id,
      input.status
    );

    return locations.map(location => this.toLocationDto(location));
  }

  /**
   * Confirms which location the tenant manages, then enqueues the backfill **after** the
   * transaction commits — BullMQ and Postgres share no transaction, so publishing inside it lets
   * a worker dequeue a syncRunId for an uncommitted row, find nothing, and fail the run.
   */
  async confirmLocation(input: {
    user: AuthUser;
    externalLocationId: string;
  }): Promise<ConfirmLocationResponseDto> {
    const tenantUser = requireTenantUser(input.user);
    const connection = await this.requireConnection(tenantUser.tenantId);

    // Re-validated against the provider rather than trusted from the body. An arbitrary id would
    // otherwise create a locations row that no poll can ever resolve — a tenant permanently stuck
    // "connected" to a location Google has never heard of.
    const providerLocations = await this.callProvider(connection, accessToken =>
      this.provider.listLocations(accessToken, connection.providerAccountId)
    );

    const match = providerLocations.find(
      location => location.externalLocationId === input.externalLocationId
    );

    if (!match) {
      throw new NotFoundException({
        message: MESSAGES.CONNECTIONS.EXTERNAL_LOCATION_NOT_FOUND,
        code: CONNECTION_ERROR_CODES.EXTERNAL_LOCATION_NOT_FOUND,
      });
    }

    await this.assertLocationLimit(tenantUser.tenantId, input.externalLocationId);

    let result: ConfirmLocationResult;
    try {
      result = await this.connectionsDbService.confirmLocation({
        tenantId: tenantUser.tenantId,
        userId: tenantUser.id,
        connection,
        externalLocationId: match.externalLocationId,
        name: match.name,
        address: match.address,
        maxActiveLocations: MAX_ACTIVE_LOCATIONS,
      });
    } catch (error) {
      // The pre-check above already rejected the common case; this is the race-safe backstop —
      // see `ConnectionsDbService.confirmLocation`. Same response either way, so the caller
      // cannot tell which one fired.
      if (error instanceof LocationLimitExceededError) {
        throw new ConflictException({
          message: MESSAGES.CONNECTIONS.LOCATION_LIMIT_REACHED,
          code: CONNECTION_ERROR_CODES.LOCATION_LIMIT_REACHED,
        });
      }
      throw error;
    }

    await this.enqueueBackfill(result, connection);

    return {
      ...this.toLocationDto(result.location),
      backfill: result.backfill
        ? {
            syncRunId: result.backfill.id,
            status: result.backfill.status,
            trigger: SyncTrigger.BACKFILL,
            startedAt: result.backfill.startedAt,
          }
        : null,
      backfillAlreadyRunning: result.backfillAlreadyRunning,
    };
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

    if (!connection || connection.disconnectedAt !== null) {
      throw new NotFoundException({
        message: MESSAGES.CONNECTIONS.CONNECTION_NOT_FOUND,
        code: CONNECTION_ERROR_CODES.CONNECTION_NOT_FOUND,
      });
    }

    const { deactivatedLocationIds } = await this.connectionsDbService.disconnect(connection.id);
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
      throw new ServiceUnavailableException({
        message: MESSAGES.CONNECTIONS.BACKFILL_ENQUEUE_FAILED,
        code: CONNECTION_ERROR_CODES.BACKFILL_ENQUEUE_FAILED,
      });
    }
  }

  /**
   * A token response with no `scope` field is accepted: Google only omits it when every requested
   * scope was granted, so absence is not the same signal as a list that lacks `business.manage`.
   */
  private hasRequiredScope(granted: string | undefined): boolean {
    if (!granted) {
      return true;
    }

    const grantedScopes = new Set(granted.split(' '));
    return GOOGLE_OAUTH.SCOPES.every(scope => grantedScopes.has(scope));
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
   * MVP's one-active-location rule. An application rule with no database constraint behind it, so
   * it has to be checked here — and re-confirming the *same* location is explicitly allowed, since
   * that is what a reconnect does and rejecting it would strand a tenant who lost their grant.
   */
  private async assertLocationLimit(tenantId: string, externalLocationId: string): Promise<void> {
    const active = await this.connectionsDbService.findLocationsByTenant(
      tenantId,
      LocationStatus.ACTIVE
    );
    const isSameLocation = active.some(
      location => location.externalLocationId === externalLocationId
    );

    if (!isSameLocation && active.length >= MAX_ACTIVE_LOCATIONS) {
      throw new ConflictException({
        message: MESSAGES.CONNECTIONS.LOCATION_LIMIT_REACHED,
        code: CONNECTION_ERROR_CODES.LOCATION_LIMIT_REACHED,
      });
    }
  }

  private async requireConnection(tenantId: string): Promise<ProviderConnectionRow> {
    const connection = await this.connectionsDbService.findConnectionByTenant(tenantId);

    if (!connection) {
      throw new NotFoundException({
        message: MESSAGES.CONNECTIONS.CONNECTION_NOT_FOUND,
        code: CONNECTION_ERROR_CODES.CONNECTION_NOT_FOUND,
      });
    }

    if (connection.status === ReviewProviderConnectionStatus.NEEDS_REAUTH) {
      throw new ConflictException({
        message: MESSAGES.CONNECTIONS.CONNECTION_NEEDS_REAUTH,
        code: CONNECTION_ERROR_CODES.CONNECTION_NEEDS_REAUTH,
      });
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
        throw new ConflictException({
          message: MESSAGES.CONNECTIONS.CONNECTION_NEEDS_REAUTH,
          code: CONNECTION_ERROR_CODES.CONNECTION_NEEDS_REAUTH,
        });
      }

      if (error instanceof ProviderNotConfiguredError) {
        throw new ServiceUnavailableException({
          message: MESSAGES.CONNECTIONS.PROVIDER_NOT_CONFIGURED,
          code: CONNECTION_ERROR_CODES.PROVIDER_NOT_CONFIGURED,
        });
      }

      // 502, deliberately distinct from the 409 above: a Google outage should offer the owner a
      // retry, not send them through a re-consent that cannot fix anything.
      this.logger.error(`Provider call failed: ${(error as Error).message}`);
      throw new BadGatewayException({
        message: MESSAGES.CONNECTIONS.PROVIDER_UNAVAILABLE,
        code: CONNECTION_ERROR_CODES.PROVIDER_UNAVAILABLE,
      });
    }
  }

  private toLocationDto(location: LocationRow): LocationDto {
    return {
      id: location.id,
      connectionId: location.providerConnectionId,
      provider: location.provider,
      externalLocationId: location.externalLocationId,
      name: location.name,
      address: location.address,
      status: location.status,
      lastSyncedAt: location.lastSyncedAt,
      lastSyncStatus: location.lastSyncStatus,
      lastSyncError: location.lastSyncError,
      onboardingBackfillCompletedAt: location.onboardingBackfillCompletedAt,
      createdAt: location.createdAt,
    };
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
