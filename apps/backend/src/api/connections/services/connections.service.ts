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

  /** "Not connected" is a 200 with `connected: false`, never a 404: it is the normal state between signup and onboarding. */
  async getConnectionStatus(user: AuthUser): Promise<ConnectionStatusResponseDto> {
    const tenantUser = requireTenantUser(user);
    const tenantId = tenantUser.tenantId;
    const connection = await this.connectionsDbService.findConnectionByTenant(tenantId);

    // A soft-disconnected row survives for same-account reconnects but its credential is revoked;
    // reporting it as a connection made the onboarding resume logic list locations against dead credentials.
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

    // The owner's chosen business wins while it is still active; otherwise fall back to the first active location.
    const selectedLocationId = await this.authDbService.findActiveLocationId(tenantId);
    const activeLocation =
      activeLocations.find(location => location.id === selectedLocationId) ?? activeLocations[0];

    // `google_connection_status` has no `disconnected` value, so a disconnected tenant is one whose
    // locations are all inactive; checking connectionStatus alone would report it as connected.
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
        // 503, not 500: the server is fine, the integration just isn't set up (check env vars).
        throw new ProviderNotConfiguredException();
      }
      throw error;
    }
  }

  /**
   * Every outcome is a 302 with `?error=`, never JSON, since the user is in a browser navigation.
   * `state` is verified and consumed before `code` is exchanged, so a request we reject never burns
   * a real authorization code.
   */
  async handleCallback(input: CallbackInput): Promise<string> {
    // `access_denied` is the owner clicking Cancel: an ordinary outcome with its own code so the UI can say so.
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

      // `business.manage` can be unticked at the consent screen; the grant then succeeds but cannot
      // read reviews. Catch it here rather than as a 403 later.
      if (!hasRequiredOAuthScope(tokens.scope)) {
        this.logger.warn(
          `Tenant ${record.tenantId} granted scopes [${tokens.scope ?? ''}] without ${GOOGLE_OAUTH.SCOPES.join(' ')}.`
        );
        return this.redirectWithError(record.returnTo, OAUTH_ERROR_CODES.INSUFFICIENT_SCOPE);
      }

      const existing = await this.connectionsDbService.findConnectionByTenant(record.tenantId);
      const sameAccount = existing?.providerAccountId === account.externalAccountId;

      // A live connection to a different account is a mismatch (an upsert would add a second row and
      // break the one-active-connection rule). A disconnected one is not: reconnecting with another
      // account is what the error copy tells the owner to do, and the old row stays as an inactive record.
      if (existing && !sameAccount && existing.disconnectedAt === null) {
        this.logger.warn(
          `Tenant ${record.tenantId} completed consent as ${account.externalAccountId} but is already connected to ${existing.providerAccountId}.`
        );
        return this.redirectWithError(record.returnTo, OAUTH_ERROR_CODES.ACCOUNT_MISMATCH);
      }

      // Same account reuses its secret slot; a new account gets its own, since the old credential is
      // revoked on disconnect.
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

      // Same-account reconnect only (`connection.id` is `existing.id`). Locations that finished their
      // backfill are left alone; the rest get a fresh backfill restarted below.
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
    // `user_locations` is a tenant-user table; narrowing keeps a platform admin a clear 403 rather
    // than a silently empty list.
    const tenantUser = requireTenantUser(input.user);
    const locations = await this.connectionsDbService.findLocationsForUser(
      tenantUser.id,
      input.status
    );

    return { locations: locations.map(location => toLocationDto(location)) };
  }

  /**
   * Backfills are enqueued after the transaction commits: BullMQ and Postgres share no transaction,
   * so publishing inside it lets a worker dequeue a run for an uncommitted row.
   */
  async confirmLocations(input: {
    user: AuthUser;
    externalLocationIds: string[];
  }): Promise<ConfirmLocationsResponseDto> {
    const tenantUser = requireTenantUser(input.user);
    const connection = await this.requireConnection(tenantUser.tenantId);

    // Re-validated against the provider: an arbitrary id would create a location no poll can resolve.
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

    // The lock-held recheck needs the tenant's real plan cap; `null` (unlimited) becomes
    // `Number.MAX_SAFE_INTEGER` since `maxActiveLocations` is a plain number.
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
      // Race-safe backstop for the pre-check above; same response either way.
      if (error instanceof LocationLimitExceededError) {
        throw new LocationLimitReachedException();
      }
      throw error;
    }

    // Every location gets its enqueue attempted: `enqueueBackfill` compensates only its own run, so
    // bailing out early would leave later locations stuck `running` with no job. The first failure is
    // re-thrown afterwards.
    let enqueueFailure: Error | undefined;
    for (const result of results) {
      try {
        await this.enqueueBackfill(result, connection);
      } catch (error) {
        // Always an Error on realistic paths; the coercion just keeps the rethrow honest.
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
              // The run's own trigger, not a hardcoded BACKFILL: an already-running run is often the 15-minute
              // `scheduled` sync.
              trigger: result.backfill.trigger,
              startedAt: result.backfill.startedAt,
            }
          : null,
        backfillAlreadyRunning: result.backfillAlreadyRunning,
      })),
    };
  }

  /**
   * The tenant-wide "currently viewing" business (`tenants.active_location_id`). Owner-only at the
   * controller. It must be an active location of this tenant, since every member's dashboard reads it.
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
   * Deliberately NOT `requireConnection()`, which rejects `needs_reauth` with a 409: a dead grant is
   * exactly when an owner most wants to disconnect.
   */
  async disconnect(user: AuthUser): Promise<DisconnectResponseDto> {
    const tenantId = requireTenantUser(user).tenantId;
    const connection = await this.connectionsDbService.findConnectionByTenant(tenantId);

    if (connection?.disconnectedAt !== null) {
      throw new ConnectionNotFoundException();
    }

    const { deactivatedLocationIds } = await this.connectionsDbService.disconnect(connection.id);

    // Every location this pointed at is now inactive; a later reconnect confirming a different set
    // would otherwise inherit a pointer into the old one.
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
   * Publishing after commit means a failure cannot be rolled back with the already-live `running`
   * run (`UNIQUE (location_id) WHERE status = 'running'`). Left alone it would block every future
   * confirm for the location, so the run is flipped to `error` (same CAS as `completeRun`) and the
   * exception rethrown rather than returning a 201 for an import that will never run.
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
      // A `MESSAGES` tag, not `internalMessage`: `error_message` is copied into `locations.last_sync_error`
      // and returned to the owner later, so the raw BullMQ/Redis text must not be persisted. The tag is
      // localized when it surfaces.
      await this.reviewSyncDbService.completeRun({
        syncRunId: result.backfill.id,
        locationId: result.location.id,
        status: SyncRunStatus.ERROR,
        errorMessage: MESSAGES.CONNECTIONS.BACKFILL_ENQUEUE_FAILED,
        markBackfillComplete: false,
        lastReviewSyncedAt: null,
      });

      // 503, not the raw queue error: the location writes already committed, so this is "try again",
      // and a raw BullMQ/Redis message must not reach an owner.
      throw new BackfillEnqueueFailedException();
    }
  }

  /**
   * Restarts a backfill for reactivated locations that never finished one. Failures are logged and
   * swallowed: the reconnect already committed and `enqueueBackfill` recorded the failure on the run.
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

      // Every location gets its enqueue attempted, even after one fails (best-effort, unlike `confirmLocations`).
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

  /** Not necessarily `reference` unchanged: `replaceCredential` returns a fresh reference when the old one is pending deletion, and that is what must be persisted. */
  private async replaceExistingCredential(
    reference: string,
    tokens: Parameters<ProviderCredentialService['replaceCredential']>[1]
  ): Promise<string> {
    return this.credentialService.replaceCredential(reference, tokens);
  }

  /**
   * Cheap, non-authoritative pre-check against the plan's `max_locations`; `confirmLocations`
   * rechecks under an advisory lock. Re-confirming an already-active location is allowed since it
   * doesn't grow the count and a reconnect needs it.
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

    // `findConnectionByTenant` also returns a disconnected row (credential revoked); every caller
    // must treat it as no connection or it could reactivate a location against a dead grant.
    if (connection?.disconnectedAt !== null) {
      throw new ConnectionNotFoundException();
    }

    if (connection.status === ReviewProviderConnectionStatus.NEEDS_REAUTH) {
      throw new ConnectionNeedsReauthException();
    }

    return connection;
  }

  /**
   * Resolves a token, runs the call, and maps provider failures to HTTP. The auth branch records
   * the failure on the connection first, since this is where a stale grant first surfaces interactively.
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

      // 502, distinct from the 409 above: an outage should offer a retry, not a re-consent.
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
