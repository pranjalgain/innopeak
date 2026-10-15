# Microsoft (Entra ID) sign-in and sign-up for tenant users — design

**Status:** approved and implemented for tenant users on `feat/microsoft-login` (branched from `development` @ `e3717f7`). Both design decisions below were confirmed: `xms_edov` is required to trust an email, and Google's complete-signup route/cookie were renamed to provider-neutral ones.

## Scope

Tenant users can **sign in** and **sign up** with a Microsoft account, exactly as they can with
Google today: the same buttons on the login and signup screens, the same business-name step for a
brand-new person, the same linking of an existing account, the same `?error=` redirects.

The Azure app registration supports **"Accounts in any organizational directory and personal
Microsoft accounts"**, so the authority is `https://login.microsoftonline.com/common` and both
work/school (Entra ID) and personal (outlook.com, hotmail.com, live.com, Xbox) accounts can sign in.

**In scope:** tenant sign-in, tenant sign-up, linking by verified email, disabled/suspended
handling, session issuance, web buttons, config, docs, tests. There is no dev stand-in: Microsoft
sign-in only ever runs against Microsoft.

**Out of scope (deliberately, can follow):** accepting a member or admin invite with Microsoft
(`/invite/:token/microsoft`), platform-admin *sign-up* with Microsoft (admins are invite-only), and any
Microsoft Graph access. Platform-admin **sign-in** is covered by [its own section](#platform-admin-sign-in-with-microsoft-sign-in-only). The
sign-in client requests only `openid email profile` and stores **no Microsoft token** — same
discipline as the Google sign-in client.

## The one thing that is not like Google: Microsoft does not verify the email claim

Google's userinfo returns `email_verified`, and the Google flow refuses an unverified address
(`EMAIL_NOT_VERIFIED`) because an address is what links an SSO login to an existing account and what
a new tenant is created under. **Microsoft's `email` claim carries no such guarantee.** Microsoft's own
documentation says it "isn't guaranteed to be correct and is mutable… never use it for authorization
or to save data for a user". In a multi-tenant app an administrator of *any* Entra tenant can set a
user's `email` to anything, including `victim@acme.com` — the known "nOAuth" account-takeover class.
Linking on that claim would let an attacker's own tenant sign them in as the victim's existing
account, and signing up with it would squat the victim's address.

So the design never trusts `email` by itself:

| Question | Answer |
|---|---|
| What identifies a returning Microsoft user? | The ID token's **`sub`** (immutable, never reassigned, pairwise per app + tenant), stored as `user_identities.provider_user_id` with provider `entra_id`. Never the email, never `preferred_username`/`upn`. |
| When is the email considered verified? | Only when the ID token carries **`xms_edov: true`** — Microsoft's "email domain owner verified" claim (the address belongs to a domain the issuing tenant has proven it owns, or is a verified Microsoft/Google/OTP account) — and an `email` claim is present. Personal Microsoft accounts carry both. |
| What if it is missing or false? | `emailVerified = false` → the callback answers `?error=EMAIL_NOT_VERIFIED`, same as an unverified Google profile. Nothing is linked and nothing is created. |
| What is needed for that? | `xms_edov` is an **optional claim** and is not issued unless the app registration asks for it (and it needs the `email` claim too). See *Azure setup* below — **without it every Microsoft sign-in is refused**. |

A returning user whose `sub` is already linked signs in on the `sub` match alone and needs no email
verification — the verification matters only when an *address* would decide who someone is (first
link to an existing account, or a new tenant).

## Flow

Identical in shape to Google's, tenant-only (`login` and `signup` intents):

1. `GET /v1/auth/microsoft?intent=login|signup` — mints a signed `state`, a server-side record
   (intent, **OIDC `nonce`**, **PKCE `code_verifier`**, hash of a browser-binding cookie) and sets the
   `microsoft_auth_sid` cookie; redirects to Microsoft's authorize endpoint
   (`response_type=code`, `scope=openid email profile`, `prompt=select_account`,
   `code_challenge_method=S256`).
2. `GET /v1/auth/microsoft/callback` — consumes the state (single-use `GETDEL`, browser-bound),
   exchanges the `code` (+ `code_verifier`, client secret) at the token endpoint, and **validates the
   ID token**: RS256 signature against Microsoft's JWKS (selected by `kid`, cached), `aud` = our client
   id, `iss` = `https://login.microsoftonline.com/<tid>/v2.0` with `<tid>` taken from the token's own
   `tid` claim (the multi-tenant rule), `exp`/`nbf`, and `nonce` = the one in the state record.
3. Resolution, shared with Google: find by `sub` → else, if the email is verified, link to the tenant
   user holding that address (finishing a stalled `pending_verification` signup and dropping its
   unproven password, as for Google) → else for `signup` mint a pending identity and go to the
   business-name step, for `login` answer `NO_ACCOUNT`. A `disabled` user or a suspended/erased tenant
   is `ACCOUNT_UNAVAILABLE`.
4. Session: the same refresh-token + access-token cookies as every other sign-in.

The tenant routes never resolve a platform admin: they only mint `login`/`signup`. An admin who also
owns a tenant under the same address may still sign up/in for that tenant (the existing
dual-identity decision). Admin sign-in has its own entry route and intent, below.

## Platform-admin sign-in with Microsoft (sign-in only)

The admin sign-in page (`/admin-login`) offers "Continue with Microsoft" next to the password form.
**Sign-in only**: platform admins are invite-only (`platform_admin_invites`), so there is no admin
sign-up with Microsoft and Microsoft can neither create an admin nor accept an invite.

- **Entry:** `GET /v1/admin/auth/microsoft` (public, throttled 10/min, like the admin Google route). It
  mints a state with the existing `OAuthIntent.ADMIN_LOGIN` (+ PKCE) and redirects to Microsoft, pinned to
  the organization's directory (`https://login.microsoftonline.com/<ADMIN_MICROSOFT_TENANT_ID>`), so
  personal accounts and other organizations never see a consent screen.
- **Callback:** the shared `GET /v1/auth/microsoft/callback` (the one redirect URI registered on the Azure
  app) now also accepts `ADMIN_LOGIN`. Admin failures redirect to `/admin-login?error=<code>&provider=microsoft`;
  success sets the admin session cookies and goes to `/admin`.
- **Resolution (never touches the tenant tables):**
  1. the ID token's `tid` must equal `ADMIN_MICROSOFT_TENANT_ID`, else `NO_ACCOUNT` (logged);
  2. an identity already linked as `(entra_id, sub)` signs in if its admin is `active`, else
     `ACCOUNT_UNAVAILABLE`;
  3. otherwise the email must be verified (`xms_edov`, else `EMAIL_NOT_VERIFIED`) and is linked to an
     **existing active** admin holding that address (row inserted into `platform_admin_identities`); an
     `invited` admin or an unknown address answers `NO_ACCOUNT` (an invite is accepted through the invite
     link, not by signing in), a `disabled` admin `ACCOUNT_UNAVAILABLE`.
- **Switches:** the platform's `microsoft_login_enabled` setting governs *tenant* sign-in only; like Google,
  admin sign-in ignores it so an admin who relies on Microsoft is never locked out by a tenant-facing
  switch. The feature is available only when the Microsoft client is configured **and**
  `ADMIN_MICROSOFT_TENANT_ID` is set; the public platform-config answers `adminMicrosoftLoginAvailable`
  (derived from env, not stored) and the web shows the button from it.
- **Config:** `ADMIN_MICROSOFT_TENANT_ID` (optional, a directory GUID). No schema change: the existing
  `platform_admin_identities (provider, provider_user_id)` already holds `entra_id` identities.
- **Azure:** the same app registration; for a single-organization directory the app must be allowed to sign
  in users of that directory (the default multi-tenant registration does).

## Security properties (and why)

- **`sub`, not email, as identity** — see above.
- **Email trusted only with `xms_edov`** — see above; fails closed.
- **State** — signed, single-use, Redis-authoritative, bound to the starting browser by a cookie,
  and **provider-bound**: the record stores `provider: 'microsoft'` and the HMAC covers it, so a
  Google `state` cannot be replayed at the Microsoft callback or the reverse.
- **PKCE (S256)** — Microsoft recommends it even for confidential clients; the verifier lives only in
  the Redis record, never in a URL or cookie.
- **`nonce`** — ties the ID token to this request, defeating token injection.
- **ID-token signature verified** even though it arrives over TLS directly from the token endpoint:
  cheap with Node's `crypto` (no new dependency), and it makes the claims safe to read.
- **No Microsoft tokens stored**; no `offline_access`, no refresh token.
- **Error bodies never logged** (a failed exchange can echo the code or client id).
- **Throttled** like Google (`short` tier on the authorize route).
- **Platform switch is enforced on the server:** `platform_settings.microsoft_login_enabled` shows or hides the
  Microsoft button and the routes refuse while it is off (`NOT_CONFIGURED`). The Google switch,
  `google_login_enabled`, is enforced the same way (see [Platform switches](./api-reference.md#platform-switches)).

## What gets generalized

Google's pieces are reused rather than copied, so the two cannot drift. Google's behaviour does not
change; names that were Google-only become provider-neutral.

| Today | Becomes |
|---|---|
| `GoogleOAuthStateService` (`auth:google-oauth-state:`) | `OAuthStateService` — keyed per provider, record carries `provider`, `nonce`, optional `codeVerifier`. Google's cookie/redirect behaviour is unchanged. |
| `PendingGoogleSignupService` + cookie `google_pending_signup` | `PendingSsoSignupService` + cookie `sso_pending_signup`; the record carries `provider` so the business-name step creates the right identity. |
| `POST /v1/auth/google/complete-signup` | `POST /v1/auth/sso/complete-signup` (one endpoint for the shared business-name screen). The Google-named route is removed; the web and SDK move to the new one. |
| `GoogleIdentity`, `GoogleAuthFailure`, `GOOGLE_AUTH_REDIRECT` | `SsoIdentity`, `SsoAuthFailure`, `SSO_REDIRECT` (renamed outright, no aliases). |
| `GOOGLE_PENDING_SIGNUP_EXPIRED` (message key and error code) | `SSO_PENDING_SIGNUP_EXPIRED`, with provider-neutral copy. |
| `AuthDbService.findGoogleIdentityBySub` / `linkGoogleIdentityByEmail` / `completeGoogleSignup` | `findSsoIdentityBySub` / `linkSsoIdentityByEmail` / `completeSsoSignup`, each taking the provider. |
| the tail of `handleGoogleCallback` (lookup → link → standing → tokens) | one private `resolveTenantSsoIdentity`, taking an optional hook for Google's admin carve-out. |

No schema change: `user_identity_provider` already has `entra_id`, and `user_identities` is already
`(provider, provider_user_id)`-unique.

## New code

- `MicrosoftIdentityProvider` (abstract) / `MicrosoftOidcProvider`, bound directly in `AuthModule`. There is
  no mock provider for either SSO provider: `DEV_GOOGLE_AUTH_MOCK` was removed along with Microsoft's.
- `IdTokenVerifier` — JWKS fetch + cache, RS256 verification, claim checks; pure and unit-tested with a
  generated key pair. An unknown `kid` (a rotation) refetches at once, with at most one request per
  5 s and a kid that is still missing not retried for 60 s; concurrent verifications share one request;
  a failed refresh of a stale set keeps using the cached key; requests time out after 10 s.
- The token exchange times out after 10 s too, ending in `?error=PROVIDER_ERROR` rather than a
  callback that never answers.
- `platform_settings.microsoft_login_enabled` is enforced on both routes (authorize and callback answer
  `?error=NOT_CONFIGURED` while it is off), not only by hiding the button.
- Only `error=access_denied` from Microsoft reads as a cancellation; any other `error` is
  `PROVIDER_ERROR`.
- Routes `GET /v1/auth/microsoft` and `GET /v1/auth/microsoft/callback`; swagger composition for both.
- `AuthService.buildMicrosoftAuthorizeRedirect` / `handleMicrosoftCallback`.

## Configuration

| Variable | Purpose |
|---|---|
| `MICROSOFT_CLIENT_ID` | Application (client) ID |
| `MICROSOFT_CLIENT_SECRET` | Client secret **value** (not the secret ID) |
| `MICROSOFT_CALLBACK_URL` | Must equal a redirect URI registered in Azure, on the **web app's origin** (e.g. `http://localhost:3002/v1/auth/microsoft/callback`; production `https://<web-domain>/v1/auth/microsoft/callback`). Not the API's origin: the browser starts the flow through the web app's `/v1/*` proxy, so the `microsoft_auth_sid` binding cookie lives on the web origin and must come back with the callback, or every sign-in fails with `INVALID_STATE`. |
| `MICROSOFT_AUTHORITY` | Optional; defaults to `https://login.microsoftonline.com/common`. Production only accepts `https://login.microsoftonline.com/<tenant>`: the JWKS, token endpoint and issuer all derive from it, so any other host would be trusted to vouch for any identity. |

The state secret is the existing `GOOGLE_AUTH_STATE_SECRET` (required in production) — shared by all
SSO providers and documented as such. Unconfigured → the routes redirect with `?error=NOT_CONFIGURED`
instead of failing at boot.

## Azure setup (one-time, required)

1. **Authentication → Web → Redirect URIs:** add the callback URL(s) above (one per environment).
2. **Certificates & secrets:** create a client secret; put its **Value** in `MICROSOFT_CLIENT_SECRET`.
3. **Token configuration → Add optional claim → ID token:** add **`email`** and **`xms_edov`**.
   Accept the prompt to enable the Microsoft Graph `email` permission. *Without `xms_edov` every
   sign-in answers `EMAIL_NOT_VERIFIED`.*
4. **API permissions:** `openid`, `email`, `profile` (delegated; no admin consent needed).
5. Leave "Supported account types" as registered: any organizational directory and personal accounts.
6. For production, set the app's publisher domain / publisher verification so non-admin users from
   other tenants are not blocked by the "unverified publisher" consent warning.

## Web

- The login and signup screens' Microsoft button navigates to `/v1/auth/microsoft?intent=login|signup`
  (as Google's does) instead of the current mock page; the mock Microsoft SSO page and its stubbed
  `loginWithMicrosoft`/`signupWithMicrosoft` are removed.
- The business-name step calls the neutral `POST /v1/auth/sso/complete-signup`.
- The existing `?error=` toast handling covers the Microsoft failures (same codes); the
  `EMAIL_NOT_VERIFIED` copy says it can be a Microsoft email-verification issue.
- `auth.googleErrors` became `auth.ssoErrors` (en and de), since one toast hook serves both providers; the mock Microsoft SSO strings were removed. Failure redirects from the Google and Microsoft callbacks carry `&provider=google|microsoft`; the hook looks up `ssoErrors.<provider>.<code>` first, then the shared `ssoErrors.<code>`, so each provider can word the same code differently (e.g. Microsoft's `EMAIL_NOT_VERIFIED` points at the account admin). The tag is added at one place per provider (`AuthService.withFailureProvider`), not at every call site.

## Local development

There is no mock: local development uses a real Azure app registration (the same setup as above, with
the `localhost:3002` callback registered). A personal Microsoft account works for testing.

## Rename compatibility (transitional)

`POST /v1/auth/sso/complete-signup` also reads the pre-rename `google_pending_signup` cookie, and the
pending-signup service falls back to the old `auth:google-pending-signup:` Redis prefix (such records
were always Google's), so a Google signup sitting on the business-name step at deploy time can
finish. Delete both fallbacks one release after this ships.

## Testing

Unit: `IdTokenVerifier` (good token; wrong `aud`, `iss`/`tid` mismatch, expired, bad signature, wrong
`nonce`, unknown `kid` refetch), the provider (token exchange, PKCE, missing `xms_edov` →
unverified), `OAuthStateService` (cross-provider replay refused), `AuthService` (all outcomes),
controller. Opt-in real-DB specs (`repositories.db.spec.ts`) for the generalized identity methods:
a Microsoft signup stored under `entra_id` and found by `sub` for Microsoft only, linking to a stalled
password signup (activates it, drops the unproven password), and Google and Microsoft identities side
by side on one user. Verified by hand against a real Azure app with a personal account.

## Known limitations

- **No automated end-to-end test against Microsoft:** the protocol handling is unit-tested, and the
  real flow has been checked by hand against Azure (hence the setup checklist).
- An Entra user with no mail attribute gets no `email` (and no `xms_edov`) claim and is refused with
  `EMAIL_NOT_VERIFIED`; they can use email/password or Google, or an admin can set the user's Email.
  Personal accounts carry both claims (observed with a real personal account).
- Microsoft sign-in is tenant-user-only for now (see *Scope*).
