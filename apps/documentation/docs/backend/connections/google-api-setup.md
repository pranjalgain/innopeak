---
sidebar_position: 3
---

# Google Business Profile — API access setup

How to get from nothing to a working **real** (non-mocked) Google Business Profile connection.

This is the counterpart to [Overview](./overview.md) and [API Reference](./api-reference.md), which
describe what the module *does*. This describes what Google requires before any of it can run
against real data.

## Read this first

**There is no sandbox.** Google provides no test-mode business and no synthetic data, and confirms
as much in its own developer community. Every Business Profile must be verified as a business
someone actually operates, so "a profile for testing" means *a real profile you have access to*.
There is no way around this.

The one partial exception is a `validateOnly` parameter on some **write** calls, which validates a
request without applying it. It does not help this module, which only reads from Google (list
locations, list reviews).

**Two of the steps below are gated by Google and take calendar time** (days to weeks), and they are
independent of each other. Start both on day one and do the mechanical configuration while you
wait.

Meanwhile, local development does not need any of this: `DEV_GBP_MOCK=true` gives a fully working
connect + backfill flow against fixtures, still routed through the real OAuth callback. See
[Local development with the mock](#local-development-with-the-mock).

---

## Gate 1 — access to an established Business Profile

:::danger The 60-day rule decides your whole approach
Google requires you to **manage a Business Profile that has been verified and active for 60+ days**
before it will grant API access.

Creating a new profile therefore does not unblock you — it starts a two-month clock. **Getting
added to an existing, established profile is the only fast path.** Plan around this before doing
anything else.
:::

Options, ordered by how quickly they unblock you:

1. **The company's own profile.** An agency or product company almost certainly has a Business
   Profile years past the 60-day bar. Ask whoever owns marketing or IT operations to add the
   dedicated test account as a **Manager** — note the requirement is to *manage* a profile, not to
   own one.
2. **A client's profile.** For a review-management product the client is, by definition, a business
   with review listings. Access to one of their locations is both the fastest route and the most
   representative test data available. Route this through whoever owns the client relationship.
3. **A business someone on the team personally controls** that has been live 60+ days.
4. **Create a new profile** — fallback only, accepting a ~2 month wait before it qualifies.

:::caution Do not register a fake business
It breaches Google's guidelines, risks suspending the account the integration is built on, and puts
a bogus listing in front of real people on Maps.
:::

Use a **dedicated Google account** rather than a personal one for whichever route you take. Its
refresh token ends up in the credential store, and whoever holds that account controls the
connection.

### If you do have to create one

Sign in at [business.google.com](https://business.google.com), then **claim** the business if it
already exists on Maps rather than creating a duplicate. A **service-area business** (no public
storefront) is usually the lighter path since it skips the address requirement. Verification is
some subset of video, phone, email, or postcard depending on category and country — video is the
common one: a continuous clip showing signage, premises, and evidence you manage the business.

Then wait out the 60 days.

Until this gate clears, the OAuth grant will succeed but return **zero accounts** — see
[Test OAuth before the profile is ready](#test-oauth-before-the-profile-is-ready).

## Gate 2 — API access approval

The Business Profile APIs are **hidden from the Cloud Console API Library** until Google allowlists
your project. If you search the library and only find *Business Profile Performance API*, that is
the expected state of an unapproved project — that one API is publicly listed, and it serves
metrics (impressions, calls, direction requests), not reviews or locations.

Per [Google's prerequisites](https://developers.google.com/my-business/content/prereqs):

1. **A Google account** (the dedicated one from Gate 1).
2. **Familiarity with the Business Profile UI** — Google expects applicants to have used the
   product.
3. **A Google Cloud project.** Note its **project number**, not just the ID.
4. **An Organization account** — a distinct thing from both your Google account and the business
   listing. Set it up via
   [the GBP help centre](https://support.google.com/business/answer/7663063). Applications are
   likely to bounce without one.
5. **Submit the access request**: the
   [GBP API contact form](https://support.google.com/business/contact/api_default), choosing
   **"Application for Basic API Access"** from the dropdown.
6. **Wait for approval.**

To strengthen the application: use an email address on the company domain (not gmail), and make
sure the website you list is live and current.

### Checking approval status without waiting on email

Approval is directly observable as a **quota change** — it is granted automatically, there is no
separate quota request to file:

| Business Profile API quota | Meaning |
|---|---|
| **0 QPM** | Not approved yet |
| **300 QPM** | Approved — proceed |

In the Cloud Console: **IAM & Admin → Quotas**, filtered to the Business Profile APIs.

---

## Enable the APIs

Once approved, the APIs appear in the library.
[Google's setup guide](https://developers.google.com/my-business/content/basic-setup) lists seven
to enable; enabling all of them is harmless, but only three are used by this module:

| API | Used for | Host in `review-provider.constants.ts` |
|---|---|---|
| **My Business Account Management API** | Resolving the provider account | `ACCOUNT_MANAGEMENT` |
| **My Business Business Information API** | Listing locations | `BUSINESS_INFORMATION` |
| **Google My Business API** | **Reviews** | `LEGACY_V4` |

The remaining four (Lodging, Place Actions, Notifications, Verifications) are not used today.

:::warning The third one is easy to skip
"Google My Business API" reads like a deprecated name, but it is the **only** API that serves
reviews, on the legacy v4 surface. Reviews were never migrated to a v1 API. Calling
`.../v4/{location}/reviews` against the Business Information host returns a 404 that looks
exactly like "this location has no reviews".
:::

### On v4 and deprecation

`accounts.locations.reviews` on v4 is **current** — Google's reference for it was still being
updated in July 2026 and carries no sunset date. What *is* deprecated in the Google My Business
API is the account surface: `accounts`, `accounts.admins`, `accounts.invitations`, and
`accounts.locations.admins`, superseded by the Account Management API.

This module is already aligned with that split — accounts come from
`mybusinessaccountmanagement.googleapis.com/v1`, reviews from `mybusiness.googleapis.com/v4`. Check
the [deprecation schedule](https://developers.google.com/my-business/content/sunset-dates) before
adding any new v4 call.

## One OAuth client, many grants

A natural wrong turn is assuming each connected business needs its own credentials. It does not.

| Thing | Scope | Where it lives |
|---|---|---|
| OAuth client ID + secret | One, for the whole product | `GBP_CLIENT_ID` / `GBP_CLIENT_SECRET` |
| API access approval | One, per Cloud project | The 300 QPM quota |
| **Refresh token** | **One per connected business** | `review_provider_connections.credential_reference` |

The client identifies *the application* to Google and never varies by customer. What varies is the
**grant**: each owner consents, and Google issues the app a refresh token scoped to what that user
can manage. This is exactly what the schema models — one connection row per tenant, unique on
`(tenant_id, provider, provider_account_id)`, each pointing at its own stored credential.

Related terminology, since Google uses all three and only one applies:

- **API key** — identifies a project for *public* data. Not used by these APIs.
- **OAuth client** — identifies an app for user-authorized access. ← this module
- **Service account** — server-to-server. **Does not work for Business Profile**: there is no way
  to reach a user's business data without their own consent grant. Worth knowing, because it is the
  natural place to look when trying to avoid per-user consent, and it is a dead end.

### Quota is per project, not per tenant

The 300 QPM granted at approval is shared across every connected business. It is a ceiling on the
whole product rather than something that scales with signups, so it belongs in capacity planning
once the scheduled poller ships.

## OAuth consent screen

- **User type**: External
- **Scope**: `https://www.googleapis.com/auth/business.manage` — the only scope these APIs gate on.
  There is no read-only variant, which is why partial-scope consent is worth handling (the module
  maps it to `INSUFFICIENT_SCOPE`).
- **Test users**: add the Google account that owns the Business Profile.
- **Leave the app in Testing.** Up to 100 users, and no app-verification review needed.

:::info Going beyond 100 users needs OAuth app verification
Testing mode caps the app at 100 test users. Onboarding real customers requires Google's **OAuth
app verification** — a third gate, separate from and after the API access approval. It needs a
privacy policy, a homepage on a domain verified in Search Console, and usually a demo video,
because `business.manage` is a sensitive scope.

Budget for it well before launch. It is the gate most likely to be discovered late.
:::

:::caution Testing-mode refresh tokens expire after 7 days
This has a visible product effect. `ProviderCredentialService` stores the refresh token and treats
a rejected refresh as a dead grant, so a connection made on Monday flips to `needs_reauth` the
following week and the owner sees the reconnect banner.

That is correct behaviour, not a bug — but expect it weekly while testing. It stops once the app is
verified for production.
:::

## OAuth client credentials

**APIs & Services → Credentials → Create credentials → OAuth client ID → Web application.**

Authorized redirect URI — this must **byte-match** `GBP_CALLBACK_URL`, or Google rejects the code
exchange:

```
http://localhost:3002/v1/connections/google/callback
```

Two things about that URL that are deliberate:

- It is the **web app's** origin (`:3002`), not the API's (`:3000`). `/v1/*` is rewritten to NestJS
  by `apps/web/next.config.ts`, which keeps the whole OAuth round trip same-origin with the app so
  the `gbp_oauth_sid` state cookie is first-party — the same arrangement the auth cookies rely on.
- Plain `http` is fine because Google permits it for `localhost` specifically. Any other host must
  be `https`.

For a deployed environment, register that environment's own origin with the same path.

## Configure the backend

In `apps/backend/.env`:

```bash
GBP_CLIENT_ID=<from the credentials page>
GBP_CLIENT_SECRET=<from the credentials page>
GBP_CALLBACK_URL=http://localhost:3002/v1/connections/google/callback
GBP_STATE_SECRET=<any long random string locally; required in production>
CREDENTIAL_ENCRYPTION_KEY=<openssl rand -base64 32>
DEV_GBP_MOCK=false
```

Restart — and kill the **compiled** process, not just the watcher wrapper, or you will test against
stale environment variables:

```bash
lsof -ti :3000 | xargs kill -9
cd apps/backend && pnpm start:dev
```

Then run the flow: sign up (or log in), and connect from `/onboarding/connect`.

---

## Test OAuth before the profile is ready

Useful sequencing while Gate 1 is still pending. With credentials configured but no verified
profile, run the connect flow anyway. The authorization redirect, `state` signing, nonce
consume-once, browser-binding cookie check, code exchange and credential storage all execute for
real. It fails at exactly one place — `fetchPrimaryAccount` throwing:

> The Google account that granted access manages no Business Profile accounts

surfaced as `?error=PROVIDER_ERROR`. **Reaching that specific error means the entire OAuth path is
wired correctly** and only the business profile is missing.

## Local development with the mock

None of the above is needed to work on this module. With `DEV_GBP_MOCK=true` (the `.env.example`
default), `MockGoogleBusinessProfileProvider` overrides only the HTTP transport, so pagination, both
mappers, `starRatingToInt`, and the error classification all still run — and the flow still round
trips through the **real** callback, exercising state verification, the nonce, the cookie check and
the connection upsert.

`DEV_GBP_MOCK` is `Joi.forbidden()` in production: a mocked connection is indistinguishable from a
real one once it is a row in Postgres, so production must not be able to create one by accident.

`DEV_GBP_MOCK_ACCOUNT_ID` forces the mock's account id, which is how the `ACCOUNT_MISMATCH` branch
gets exercised.

## Known gaps to revisit with real credentials

- **`fetchPrimaryAccount` takes `accounts[0]`.** Correct for a single business, wrong for a Google
  account managing several — it will silently connect whichever Google returns first. The fixtures
  have one account, so the mock never exercises this.
- **The real network path is unverified.** The mock inherits the mappers and pagination, so the
  untested surface is narrow: `request()`'s actual `fetch`, the two host URLs, and Google's exact
  response envelope.
- **Confirm the registered `redirect_uri` per environment.** A cookie-bound state on a
  backend-origin callback passes on localhost and fails in production — the worst possible failure
  mode, because it only appears after deploy.

## References

- [Prerequisites](https://developers.google.com/my-business/content/prereqs)
- [Basic setup](https://developers.google.com/my-business/content/basic-setup)
- [Applying for API access](https://support.google.com/business/workflow/16726127)
- [GBP API contact form](https://support.google.com/business/contact/api_default)
- [Organization accounts](https://support.google.com/business/answer/7663063)
- [Deprecation schedule](https://developers.google.com/my-business/content/sunset-dates)
- [`accounts.locations.reviews`](https://developers.google.com/my-business/reference/rest/v4/accounts.locations.reviews)
