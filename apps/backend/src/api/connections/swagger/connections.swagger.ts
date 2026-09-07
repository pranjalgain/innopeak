import { LocationStatus } from '@common/enums/location-status.enum';
import { applyDecorators } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiQuery, ApiResponse } from '@nestjs/swagger';

import { ConfirmLocationDto } from '../dto/connection-request.dto';
import {
  AvailableLocationsResponseDto,
  ConfirmLocationResponseDto,
  ConnectionStatusResponseDto,
  DisconnectResponseDto,
  LocationListResponseDto,
} from '../dto/connection-response.dto';
import { ReturnTo } from '../enums/return-to.enum';

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
    ApiResponse({ status: 200, type: ConnectionStatusResponseDto }),
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
    ApiResponse({ status: 200, type: DisconnectResponseDto }),
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
    ApiResponse({ status: 200, type: AvailableLocationsResponseDto }),
    ApiResponse({ status: 409, description: 'CONNECTION_NEEDS_REAUTH' }),
    ApiResponse({ status: 502, description: 'PROVIDER_UNAVAILABLE' })
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
    ApiResponse({ status: 200, type: LocationListResponseDto })
  );
}

export function ApiConfirmLocation(): ReturnType<typeof applyDecorators> {
  return applyDecorators(
    ApiBearerAuth(),
    ApiOperation({
      summary: 'Confirm the managed location and start the historical backfill',
      description:
        'One transaction across three tables: upsert `locations`, insert `user_locations`, ' +
        'acquire the backfill `sync_runs` row. The job is enqueued only after that commits — ' +
        'BullMQ and Postgres share no transaction. Idempotent: a double-submitted confirm returns ' +
        '200 with `backfillAlreadyRunning: true` and the existing run, rather than a 409 that ' +
        'would leave the client with no id to poll.',
    }),
    ApiBody({
      type: ConfirmLocationDto,
      examples: {
        default: {
          summary: 'Confirm the discovered location',
          value: { externalLocationId: 'locations/12345678901234567890' },
        },
      },
    }),
    ApiResponse({ status: 201, type: ConfirmLocationResponseDto }),
    ApiResponse({ status: 404, description: 'CONNECTION_NOT_FOUND | EXTERNAL_LOCATION_NOT_FOUND' }),
    ApiResponse({ status: 409, description: 'CONNECTION_NEEDS_REAUTH | LOCATION_LIMIT_REACHED' })
  );
}
