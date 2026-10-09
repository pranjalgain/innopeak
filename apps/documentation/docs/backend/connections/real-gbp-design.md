---
sidebar_position: 4
---

# Real Google Business Profile only — design

**Status:** proposed, pending confirmation, on `feat/gbp-real-api` (from `development` @ `174c078`).
Decided: the local mock server goes entirely, and several Business Profile accounts get a picker.

Progress: the mocks are removed (everything in *What is removed* below) and the account picker is built
(*Account picker* below; routes in the [API reference](./api-reference.md)). The live-data checks need a real
profile and are still to do.

## Goal

The connections module talks to real Google only. Every GBP stand-in is removed, so a connection,
its locations and its reviews always come from a real Business Profile, and the gaps that only show
up against live data are closed.

What Google requires before this works (access approval, consent screen, OAuth client) is in
[API access setup](./google-api-setup.md); the summary is under [Google Cloud setup](#google-cloud-setup).

## What is removed

| Stand-in | Where | Replaced by |
|---|---|---|
| `MockGoogleBusinessProfileProvider` (`DEV_GBP_MOCK`, `DEV_GBP_MOCK_ACCOUNT_ID`) | `review-provider/providers/`, factory in `review-provider.module.ts` | `GoogleBusinessProfileProvider`, bound directly |
| Account and location fixtures | `review-provider/fixtures/gbp-accounts.fixture.ts`, `gbp-locations.fixture.ts` | Nothing (only the mock used them) |
| Reviews fixture | `review-provider/fixtures/gbp-reviews.fixture.ts` | Kept for the mapper spec, moved to `mappers/__fixtures__/`; `tsconfig.build.json` excludes `**/__fixtures__/**`, so it never ships |
| Reply read/write redirect to the local mock server (`localMockServerUrl`) | `GoogleBusinessProfileProvider.legacyV4Base()` | Always `mybusiness.googleapis.com/v4` |
| The whole `apps/mock-external-apis` package (GBP and Azure OpenAI emulation) | `apps/mock-external-apis` | Nothing |
| `USE_LOCAL_MOCK_SERVER`, `LOCAL_MOCK_SERVER_URL`, `common/helpers/local-mock-server.util.ts` | `config/`, `AzureOpenAiProvider`, `review-provider.module.ts` | Nothing: Azure OpenAI always calls its configured endpoint |
| `DEV_GBP_MOCK*` in env config, Joi schema, `.env.example` | `config/` | Nothing |

With the mock server gone, local AI drafting calls the configured model (`AI_PROVIDER`) for real, so it
needs that provider's credentials and is billed.

## Gaps closed for live data

1. **Several Business Profile accounts.** `fetchPrimaryAccount` takes `accounts[0]`, so a Google user
   who manages more than one account (their own plus a location group, or an agency's) silently
   connects whichever Google lists first, possibly one with no locations. Replaced by an account
   picker, below.
2. **Location paging.** Locations are read with `pageSize=100`; a business with more is checked to
   follow `nextPageToken` to the end.
3. **Response shape on the real host.** The mapper and pagination are unit-tested against fixtures
   that mirror Google's documented envelopes; the first live run is checked against real payloads
   (field presence, empty `reviews`, `starRating` values) and any difference fixed in the mappers.
4. **Quota.** 300 requests/min per Cloud project, shared across every connected business. The 15-minute
   poller already backs off on 429 (`RATE_LIMIT_*`); the doc records the ceiling so it is planned for.

## Account picker

When the consenting Google user manages exactly one Business Profile account, nothing changes. With
several:

1. **Callback.** `exchangeCode` returns every account (`GET accounts`, all pages) instead of the first.
   The callback runs the same checks as today (state, scope). A tenant with a live connection is
   never asked: its own account is reconnected, or the callback answers `ACCOUNT_MISMATCH` when the
   grant lacks it. Otherwise, instead of creating the connection, it saves a **pending account choice**
   (with the flow's `returnTo`) and redirects to the connect screen with `?account_choice=pending`
   (the onboarding screen, the one that hosts the picker).
2. **Pending choice.** One Redis record per tenant (`connections:pending-account:<tenantId>`,
   15-minute TTL), holding the account list (id, name, type) and the token set **encrypted with
   `CREDENTIAL_ENCRYPTION_KEY`**. Nothing goes to the credential store until an account is chosen,
   so an abandoned choice leaves no orphaned secret. It is bound to the user who started the grant,
   and a new grant replaces it.
3. **Picker.** `GET /v1/connections/google/accounts/pending` (owner-only) lists the choices: account
   name and type (personal, location group, organization). The connect screen shows them as a radio
   list, with a "Connect" button; no account is preselected. The screen asks on every load, so a
   refresh keeps the picker.
4. **Choose.** `POST /v1/connections/google/accounts/select { accountId }` checks the id is one of the
   pending choices, claims the record (single-use), then runs exactly the code path the callback
   runs for one account: account-mismatch check, credential stored or replaced, connection
   upserted, a same-account reconnect reactivating locations. If that fails the record goes back, so
   "Try again" returns to the picker (unless Google rejected the grant, which needs a new consent).
   The flow then continues to the location list, or to Settings when it started there.
5. **Expired or missing choice.** Both endpoints answer `410 ACCOUNT_CHOICE_EXPIRED`; the screen
   offers "Connect again", which starts a fresh grant.

A Google account that manages no Business Profile account still fails at the callback with
`PROVIDER_ERROR`, as today. New strings ship in English and German.

## Google Cloud setup

APIs to enable (they only appear in the library once Google approves API access):

| API | Service name | Used for |
|---|---|---|
| My Business Account Management API | `mybusinessaccountmanagement.googleapis.com` | Finding the Business Profile account(s) the user manages |
| My Business Business Information API | `mybusinessbusinessinformation.googleapis.com` | Listing locations |
| Google My Business API | `mybusiness.googleapis.com` | Reviews: listing, reading and posting replies (legacy v4, the only API that serves reviews) |

Not needed: Business Profile Performance, Lodging, Place Actions, Notifications, Verifications.
Sign-in with Google needs no API enabled (OpenID Connect only).

Also required: the Basic API Access approval (quota 300 QPM, not 0), an OAuth consent screen with
the `business.manage` scope and the test Google account as a test user, and a Web OAuth client whose
redirect URI byte-matches `GBP_CALLBACK_URL` (`http://localhost:3002/v1/connections/google/callback`
locally).

## Local development afterwards

There are no mocks: local development needs the Cloud project above, a Google account that manages a
verified Business Profile, and credentials for the configured AI provider. In Testing mode Google
expires refresh tokens after 7 days, so a local connection flips to `needs_reauth` weekly; that is
expected.

## Testing

Unit tests keep covering the provider (requests, paging, error classification, token refresh) with
`fetch` stubbed, and the mappers with the moved reviews fixture. The picker gets service and
controller tests (one account skips it; several save a pending choice; select checks membership, is
single-use and reuses the existing connection rules; expiry answers 410) and web tests for the
picker screen. A manual checklist runs once against
a real profile: connect, location list, backfill, a new review arriving via the poller, posting a
reply, and reconnecting after revoking access.

## Decisions

1. **Local mock server:** removed entirely, including the Azure OpenAI emulation.
2. **Several Business Profile accounts:** the account picker above.
