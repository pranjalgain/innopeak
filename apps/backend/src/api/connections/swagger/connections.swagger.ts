import { LocationStatus } from '@common/enums/location-status.enum';
import { ReviewProviderConnectionStatus } from '@common/enums/review-provider-connection-status.enum';
import { ReviewProvider } from '@common/enums/review-provider.enum';
import { SyncHealthStatus } from '@common/enums/sync-health-status.enum';
import { SyncRunStatus } from '@common/enums/sync-run-status.enum';
import { SyncTrigger } from '@common/enums/sync-trigger.enum';
import { applyDecorators } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiQuery, ApiResponse } from '@nestjs/swagger';

import {
  ConfirmLocationDto,
  SelectAccountDto,
  SetActiveLocationDto,
} from '../dto/connection-request.dto';
import {
  AvailableLocationsResponseDto,
  ConfirmLocationsResponseDto,
  ConnectionStatusResponseDto,
  DisconnectResponseDto,
  LocationDto,
  LocationListResponseDto,
  PendingAccountsResponseDto,
  SelectAccountResponseDto,
} from '../dto/connection-response.dto';
import { ConnectionState } from '../enums/connection-state.enum';
import { ReturnTo } from '../enums/return-to.enum';

const LOCATION_DTO_EXAMPLE = {
  id: '0190f4c2-1d55-7b09-8e42-6a3c9f01b7d4',
  connectionId: '0190f4c1-8a21-7c33-9f01-2b7d5e8a4410',
  provider: ReviewProvider.GOOGLE,
  externalLocationId: 'locations/12345678901234567890',
  name: 'The Coastal Table',
  address: '214 Harbor St, Portland, ME',
  status: LocationStatus.ACTIVE,
  lastSyncedAt: '2026-09-01T14:15:00.000Z',
  lastSyncStatus: SyncHealthStatus.OK,
  lastSyncError: null,
  onboardingBackfillCompletedAt: '2026-09-01T09:11:42.000Z',
  createdAt: '2026-09-01T09:05:02.000Z',
};

export function ApiGetConnection(): ReturnType<typeof applyDecorators> {
  return applyDecorators(
    ApiBearerAuth(),
    ApiOperation({
      summary: "The tenant's whole connection picture in one call",
      description:
        "The connection row, the location it resolved to, and that location's sync snapshot — " +
        'so a guard can answer "is this tenant set up?" without three requests. A tenant with no ' +
        'connection is a 200 with `connected: false`, never a 404: not-connected-yet is the ' +
        'normal state of every tenant between signup and onboarding.',
    }),
    ApiResponse({
      status: 200,
      type: ConnectionStatusResponseDto,
      examples: {
        connected: {
          summary: 'Connected, with an active location',
          value: {
            connected: true,
            status: ConnectionState.CONNECTED,
            connection: {
              id: '0190f4c1-8a21-7c33-9f01-2b7d5e8a4410',
              provider: ReviewProvider.GOOGLE,
              providerAccountId: 'accounts/108327761122',
              connectionStatus: ReviewProviderConnectionStatus.ACTIVE,
              tokenExpiresAt: '2026-09-04T10:12:00.000Z',
              connectedByUserId: '0190f3b2-4c17-7a88-b210-9e4f1c7d3a02',
              connectedAt: '2026-09-01T09:04:11.000Z',
            },
            location: {
              id: '0190f4c2-1d55-7b09-8e42-6a3c9f01b7d4',
              provider: ReviewProvider.GOOGLE,
              externalLocationId: 'locations/12345678901234567890',
              businessName: 'The Coastal Table',
              address: '214 Harbor St, Portland, ME',
              status: LocationStatus.ACTIVE,
              lastSyncedAt: '2026-09-01T14:15:00.000Z',
              lastSyncStatus: SyncHealthStatus.OK,
              lastSyncError: null,
              onboardingBackfillCompletedAt: '2026-09-01T09:11:42.000Z',
            },
          },
        },
        notConnected: {
          summary: 'Never connected (or fully disconnected)',
          value: {
            connected: false,
            status: ConnectionState.DISCONNECTED,
            connection: null,
            location: null,
          },
        },
      },
    }),
    ApiResponse({ status: 401, description: 'Missing or expired access token' })
  );
}

export function ApiAuthorize(): ReturnType<typeof applyDecorators> {
  return applyDecorators(
    ApiBearerAuth(),
    ApiOperation({
      summary: 'Start the Google Business Profile grant (302 to consent)',
      description:
        'Entered as a top-level browser navigation, so tenant context cannot ride in a body — it ' +
        'is read off the session and bound to a signed, single-use `state` plus a browser-binding ' +
        'cookie. This is also the reconnect route: recovery from `needs_reauth` is the same round ' +
        'trip and the same upsert, so there is no separate /reauth endpoint to keep in sync.',
    }),
    ApiQuery({
      name: 'returnTo',
      required: false,
      enum: ReturnTo,
      description: 'Allowlist key, never a URL — a raw URL here would be an open redirect.',
    }),
    ApiResponse({ status: 302, description: "Redirect to Google's consent screen" }),
    ApiResponse({ status: 403, description: 'Caller is a member, not an owner' }),
    ApiResponse({ status: 503, description: 'Google Business Profile is not configured' })
  );
}

export function ApiCallback(): ReturnType<typeof applyDecorators> {
  return applyDecorators(
    ApiOperation({
      summary: 'Google OAuth callback (public — Google performs this request)',
      description:
        'Public because Google, not the SPA, makes this request and it carries no bearer token. ' +
        'All tenant context comes from `state`, which is verified and consumed **before** `code` ' +
        'is exchanged or anything is written. Every outcome is a 302 with `?connected=1` or ' +
        '`?error=<CODE>` — never JSON, since the user is mid-browser-navigation. Error codes: ' +
        'INVALID_STATE, ACCESS_DENIED, PROVIDER_ERROR, ACCOUNT_MISMATCH, INSUFFICIENT_SCOPE.',
    }),
    ApiResponse({ status: 302, description: 'Redirect back to the frontend' })
  );
}

export function ApiDisconnect(): ReturnType<typeof applyDecorators> {
  return applyDecorators(
    ApiBearerAuth(),
    ApiOperation({
      summary: 'Disconnect Google Business Profile',
      description:
        'The destructive-looking action that destroys nothing. Flips every location to ' +
        '`inactive` and revokes the stored credential; never DELETEs. `locations` cascades from ' +
        'the connection and `reviews`/`sync_runs` cascade from locations, so a delete would take ' +
        "the tenant's entire review history with it.",
    }),
    ApiResponse({
      status: 200,
      type: DisconnectResponseDto,
      examples: {
        default: {
          summary: 'Disconnected successfully',
          value: {
            provider: ReviewProvider.GOOGLE,
            deactivatedLocationIds: ['0190f4c2-1d55-7b09-8e42-6a3c9f01b7d4'],
            credentialRevoked: true,
            pollingStopped: true,
          },
        },
      },
    }),
    ApiResponse({ status: 404, description: 'CONNECTION_NOT_FOUND' })
  );
}

export function ApiAvailableLocations(): ReturnType<typeof applyDecorators> {
  return applyDecorators(
    ApiBearerAuth(),
    ApiOperation({
      summary: 'Locations the granted Google account can see (live provider call)',
      description:
        'A live call, not a database read — nothing is persisted until the owner confirms one, so ' +
        'calling it twice is free and calling it after a reconnect reflects locations added or ' +
        "removed on Google's side. Also the first place a stale grant surfaces interactively: a " +
        '401/403 from Google sets `needs_reauth` before answering 409.',
    }),
    ApiResponse({
      status: 200,
      type: AvailableLocationsResponseDto,
      examples: {
        default: {
          summary: 'Locations available on the granted Google account',
          value: {
            provider: ReviewProvider.GOOGLE,
            connectionId: '0190f4c1-8a21-7c33-9f01-2b7d5e8a4410',
            locations: [
              {
                externalLocationId: 'locations/12345678901234567890',
                name: 'The Coastal Table',
                address: '214 Harbor St, Portland, ME',
                alreadyConnected: false,
              },
            ],
          },
        },
      },
    }),
    ApiResponse({ status: 409, description: 'CONNECTION_NEEDS_REAUTH' }),
    ApiResponse({ status: 502, description: 'PROVIDER_UNAVAILABLE' })
  );
}

export function ApiPendingAccounts(): ReturnType<typeof applyDecorators> {
  return applyDecorators(
    ApiBearerAuth(),
    ApiOperation({
      summary: 'Business Profile accounts waiting for the owner to choose',
      description:
        'After consent, when the Google account manages **several** Business Profile accounts, the callback ' +
        'redirects to the connect screen with `?account_choice=pending` instead of connecting one. This lists ' +
        'the candidates. The choice is held for 15 minutes and only the user who consented can read it. ' +
        "`410 ACCOUNT_CHOICE_EXPIRED` when there is none (expired, already settled, or someone else's).",
    }),
    ApiResponse({
      status: 200,
      type: PendingAccountsResponseDto,
      examples: {
        default: {
          summary: 'Two accounts to choose between',
          value: {
            accounts: [
              { accountId: 'accounts/108327761122', name: 'Jane Doe', type: 'PERSONAL' },
              {
                accountId: 'accounts/108327764455',
                name: 'The Coastal Group',
                type: 'LOCATION_GROUP',
              },
            ],
          },
        },
      },
    }),
    ApiResponse({ status: 410, description: 'ACCOUNT_CHOICE_EXPIRED' })
  );
}

export function ApiSelectAccount(): ReturnType<typeof applyDecorators> {
  return applyDecorators(
    ApiBearerAuth(),
    ApiOperation({
      summary: 'Connect the Business Profile account the owner chose',
      description:
        'Settles the pending choice. `accountId` must be one of the listed accounts (`400 ' +
        'ACCOUNT_NOT_IN_CHOICE` otherwise, and the choice stays so it can be retried). The choice is single-use: ' +
        'a second submission gets `410`. From there it follows the same rules as a one-account callback, so a ' +
        'live connection to a *different* account is `409 ACCOUNT_MISMATCH`.',
    }),
    ApiBody({
      type: SelectAccountDto,
      examples: {
        default: {
          summary: 'Choose the group account',
          value: { accountId: 'accounts/108327764455' },
        },
      },
    }),
    ApiResponse({
      status: 200,
      type: SelectAccountResponseDto,
      examples: {
        default: {
          summary: 'Connected',
          value: {
            connectionId: '0190f4c1-8a21-7c33-9f01-2b7d5e8a4410',
            accountId: 'accounts/108327764455',
          },
        },
      },
    }),
    ApiResponse({ status: 400, description: 'ACCOUNT_NOT_IN_CHOICE' }),
    ApiResponse({ status: 409, description: 'ACCOUNT_MISMATCH' }),
    ApiResponse({ status: 410, description: 'ACCOUNT_CHOICE_EXPIRED' })
  );
}

export function ApiListLocations(): ReturnType<typeof applyDecorators> {
  return applyDecorators(
    ApiBearerAuth(),
    ApiOperation({
      summary: "The tenant's persisted locations",
      description:
        'Joined through `user_locations` rather than filtered on `locations.tenant_id` alone — ' +
        'identical results today, already correct on the day a member is scoped to one store of ' +
        "several. Returns inactive locations too, so a disconnected tenant's history stays " +
        'addressable.',
    }),
    ApiQuery({ name: 'status', required: false, enum: LocationStatus }),
    ApiResponse({
      status: 200,
      type: LocationListResponseDto,
      examples: {
        default: {
          summary: "The tenant's persisted locations",
          value: { locations: [LOCATION_DTO_EXAMPLE] },
        },
      },
    })
  );
}

export function ApiConfirmLocation(): ReturnType<typeof applyDecorators> {
  return applyDecorators(
    ApiBearerAuth(),
    ApiOperation({
      summary: 'Confirm the managed locations and start each historical backfill',
      description:
        'One transaction across three tables, looped once per confirmed location: upsert ' +
        '`locations`, insert `user_locations`, acquire the backfill `sync_runs` row. Each job is ' +
        'enqueued only after that transaction commits — BullMQ and Postgres share no transaction. ' +
        'Idempotent per location: a double-submitted confirm still answers 201 with ' +
        '`backfillAlreadyRunning: true` and the existing run for that location, rather than a 409 ' +
        'that would leave the client with no id to poll. If an enqueue itself fails (a Redis/BullMQ ' +
        "blip after the transaction already committed), that location's sync run is immediately " +
        'compensated to `error` rather than left stuck `running` forever, and this request answers ' +
        '503 — every location up to that point is confirmed, but the caller must confirm again to ' +
        'start a fresh import for the ones that failed to enqueue.',
    }),
    ApiBody({
      type: ConfirmLocationDto,
      examples: {
        default: {
          summary: 'Confirm the discovered locations',
          value: {
            externalLocationIds: [
              'locations/12345678901234567890',
              'locations/98765432109876543210',
            ],
          },
        },
      },
    }),
    ApiResponse({
      status: 201,
      type: ConfirmLocationsResponseDto,
      examples: {
        default: {
          summary: 'One location confirmed, backfill started',
          value: {
            locations: [
              {
                ...LOCATION_DTO_EXAMPLE,
                backfill: {
                  syncRunId: '0190f4c3-9e07-7d15-a4c8-3f1b6d2e9057',
                  status: SyncRunStatus.RUNNING,
                  trigger: SyncTrigger.BACKFILL,
                  startedAt: '2026-09-01T09:05:03.000Z',
                },
                backfillAlreadyRunning: false,
              },
            ],
          },
        },
      },
    }),
    ApiResponse({ status: 404, description: 'CONNECTION_NOT_FOUND | EXTERNAL_LOCATION_NOT_FOUND' }),
    ApiResponse({ status: 409, description: 'CONNECTION_NEEDS_REAUTH | LOCATION_LIMIT_REACHED' }),
    ApiResponse({
      status: 503,
      description:
        'BACKFILL_ENQUEUE_FAILED — the locations up to this point are confirmed, but starting the import for the rest failed; retry the confirm.',
    })
  );
}

export function ApiSetActiveLocation(): ReturnType<typeof applyDecorators> {
  return applyDecorators(
    ApiBearerAuth(),
    ApiOperation({
      summary: "Switch the tenant's currently-viewed business",
      description:
        "A single shared value for the whole tenant, not per-user — every member's Dashboard/" +
        'Review Queue reads it, so only an owner may change it. The location must belong to this ' +
        "tenant and be active; a deactivated location or another tenant's id is rejected.",
    }),
    ApiBody({
      type: SetActiveLocationDto,
      examples: {
        default: {
          summary: 'Switch to a different confirmed location',
          value: { locationId: '0190f4c2-1d55-7b09-8e42-6a3c9f01b7d4' },
        },
      },
    }),
    ApiResponse({
      status: 200,
      type: LocationDto,
      examples: {
        default: { summary: 'Active location updated', value: LOCATION_DTO_EXAMPLE },
      },
    }),
    ApiResponse({ status: 403, description: 'Caller is a member, not an owner' }),
    ApiResponse({ status: 404, description: 'LOCATION_NOT_FOUND' }),
    ApiResponse({ status: 409, description: 'LOCATION_INACTIVE' })
  );
}
