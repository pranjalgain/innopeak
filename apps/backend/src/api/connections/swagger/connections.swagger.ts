import { LocationStatus } from '@common/enums/location-status.enum';
import { applyDecorators } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiQuery, ApiResponse } from '@nestjs/swagger';

import { ConfirmLocationDto, SetActiveLocationDto } from '../dto/connection-request.dto';
import {
  AvailableLocationsResponseDto,
  ConfirmLocationsResponseDto,
  ConnectionStatusResponseDto,
  DisconnectResponseDto,
  LocationDto,
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
    ApiResponse({ status: 201, type: ConfirmLocationsResponseDto }),
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
    ApiBody({ type: SetActiveLocationDto }),
    ApiResponse({ status: 200, type: LocationDto }),
    ApiResponse({ status: 403, description: 'Caller is a member, not an owner' }),
    ApiResponse({ status: 404, description: 'LOCATION_NOT_FOUND' }),
    ApiResponse({ status: 409, description: 'LOCATION_INACTIVE' })
  );
}
