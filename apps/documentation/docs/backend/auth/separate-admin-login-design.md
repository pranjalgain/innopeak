# Separating platform-admin auth from tenant auth — design

**Status:** design, pending confirmation, on `feat/separate-admin-login` (branched from `development` @ `73d46a6`, which already has the full invite-flow work merged).

## Why

`AuthController`/`AuthService` currently serve two structurally different principals —
tenant `users` and `platform_admins` — through the same `login`, the same three session cookies,
and (as of the invite-flow branch) the same `GET /v1/auth/google/callback`. That sharing is not
free. Every real bug found while building and reviewing the invite flow traces back to it:

1. **`assertEmailNotAPlatformAdmin`** exists only because `login` has to resolve one email to
   exactly one table, and it broke the moment invite-acceptance shipped — it had to be rewritten
   mid-branch to stop treating "no accept flow exists" as a safe assumption.
2. **`OAuthIntent` silently widened** the *tenant* signup/login authorize route
   (`GoogleAuthorizeQueryDto`) to accept `admin_invite`, because admin and tenant OAuth share one
   entry-point DTO.
3. **The `AdminGuard` lockout bug** (fixed on the invite branch): an admin's session lives in the
   same cookie/localStorage machinery a tenant's does, and the recovery path built for a tenant's
   refresh token actively destroyed an admin's session, which has no refresh token to recover
   with.
4. **The hijack hazard `setAdminSessionCookies`'s own comment documents at length**: admin login
   has to explicitly `clearCookie(refresh_token)` on the way in, because a lingering *tenant*
   refresh cookie in the same browser would otherwise let the tenant's own next
   `/v1/auth/refresh` silently convert an admin session back into that tenant's.

Four separate incidents, one root cause. This document proposes giving platform admins their own
login surface, their own session cookies, and (per a mid-review question) folds the invite-accept
endpoints in with it, since those already operate on the same `platform_admins` domain and would
otherwise be left stranded on the tenant controller.

## What is explicitly NOT changing

- **The Google OAuth callback stays shared** (`GET /v1/auth/google/callback`, one route,
  registered once with Google). Splitting it into two callback URLs was tried once already in
  this codebase's own design history and abandoned (`api-reference.md`'s "An earlier draft ...
  that fell apart the moment invite-acceptance needed OAuth too") — the dispatch-on-signed-`state`
  pattern is the right shape, it just needs to compose two services now instead of one (see
  below).
- **Tenant signup is untouched.** Admins never had a signup path; nothing here changes that.
- **`JwtStrategy`, `RolesGuard`, `AuthUser`, every `@Roles(JwtTokenType.PLATFORM_ADMIN)` route** —
  all already dispatch on the JWT's own `type` claim, not on which controller issued it or which
  cookie carried it. None of this layer needs to change. The one exception is the cookie
  *extractor* (`fromAccessTokenCookie`), which currently reads a single hardcoded cookie name —
  see below.
- **`LoginAttemptService`/`OtpAttemptService`** stay shared, injected into both services. Both are
  already keyed purely by normalized email in Redis; there's no principal-specific state to
  duplicate.

## Backend changes

### 1. New module: platform-admin auth

A new `PlatformAdminAuthService` + `PlatformAdminAuthController`, living under `src/api/auth/`
alongside the existing tenant one (not under `src/api/admin/`, which is `@Roles`-gated and
requires an *already-authenticated* admin — this new controller is public, like `AuthController`
is).

Routes, all `@Public()`, moved off `AuthController` as-is (same DTOs, same throttles, same
messages):

```
POST /v1/admin/auth/login
GET  /v1/admin/auth/invite/:token
POST /v1/admin/auth/invite/accept
GET  /v1/admin/auth/invite/:token/google
```

New `RouteNames` members: `ADMIN_AUTH = 'admin/auth'`, reusing the existing `LOGIN`/
`INVITE_VALIDATE`/`INVITE_ACCEPT`/`INVITE_GOOGLE` segment names under that new controller path.

Methods that move from `AuthService` to `PlatformAdminAuthService`, verbatim:
`platformAdminLogin` (renamed `login`), `validateAdminInvite`, `acceptAdminInvite`,
`buildAdminInviteGoogleRedirect`, `buildPlatformAdminLoginResult`, `adminInviteFailureUrl`. Each
already only touches `platformAdminDbService`/`tokenService`/`hashingService`/
`googleOAuthStateService` — no tenant state to untangle.

`completeAdminInviteGoogle` also moves, but it's called from the *shared* callback (see below), so
it becomes a public method on `PlatformAdminAuthService` rather than a private one on whichever
service owns the callback.

### 2. The shared Google callback composes both services

`handleGoogleCallback` stays on `AuthService` (it's still primarily the tenant login/signup
flow), but gains a constructor dependency on `PlatformAdminAuthService` for exactly two calls it
already makes:

- `consumed.record.intent === OAuthIntent.ADMIN_INVITE` → delegates to
  `platformAdminAuthService.completeAdminInviteGoogle(inviteToken, identity)` instead of a private
  method on itself.
- The "is this Google identity already linked to a returning admin?" check (added during the
  invite-branch review, to fix the lockout-on-login bug) → delegates to
  `platformAdminAuthService.findLinkedAdmin(identity.providerUserId)`, which wraps
  `platformAdminDbService.findByGoogleIdentity` and the token-issuing that follows a hit.

This is a real dependency in a direction that reads slightly oddly (the tenant service depends on
the admin one), but it's the same shape the callback already has today, just naming an explicit
seam instead of an implicit one. The alternative — moving `handleGoogleCallback` itself into a
third, principal-neutral service — was considered and rejected: it would need almost every
dependency both existing services already have (`googleIdentityProvider`,
`googleOAuthStateService`, `pendingGoogleSignupService`, both DB services), for no reduction in
coupling, just a rename of where it lives.

### 3. Distinct session cookies for admins

Today, `access_token`/`refresh_token`/`session` are shared cookie *names* across both principals,
distinguished only by which one is currently set and by the JWT's own `type` claim inside
`access_token`. That sharing is what makes hazard #4 above possible at all, and it also means an
admin session and a tenant session can never coexist in the same browser — logging in as one
silently destroys the other (`setAdminSessionCookies` overwrites `access_token` and deletes
`refresh_token` outright).

Proposed: a distinct `admin_access_token` cookie (`ADMIN_ACCESS_TOKEN_COOKIE_NAME`), path `/`,
same TTL as today's access token. Admin login stops touching `refresh_token`/`access_token` at
all — there's nothing to clear once the two namespaces don't collide.

The session hint cookie (`session`, values `tenant`/`admin`) is **left as one shared cookie** in
this proposal — splitting it into two independent hints so both sessions could show correctly in
`proxy.ts` simultaneously is a real improvement but a separate, smaller follow-up; call it out as
an option, not a requirement, since the credential-cookie separation is what actually closes the
hijack hazard.

**`fromAccessTokenCookie` must check both cookie names, and the order it tries them in must be
route-aware.** Once the two credentials no longer collide, a browser CAN carry both at once — a
tenant owner and a platform admin signed in together, exactly the coexistence this section exists
to unlock — so "order doesn't matter" is false the moment that happens: a fixed preference for
`ACCESS_TOKEN_COOKIE_NAME` would 403 every admin-route request from such a browser, since the
tenant JWT never satisfies `@Roles(PLATFORM_ADMIN)`. The extractor tries `admin_access_token` first
for an admin-area request (`/v{n}/admin/...`) and `access_token` first for anything else, falling
back to the other cookie if the preferred one is absent. This is the one change to the shared
JWT-extraction layer this whole document otherwise avoids.

### 4. Migration shim for existing admin sessions

Renaming the cookie signs out every currently-signed-in admin on deploy (there is exactly one
seeded root today, per this session's own DB inspection, so the blast radius is small — but this
should still be deliberate, not an accident of the diff). Two options:

- **Accept it.** Admins are internal staff; a forced re-login is a minor inconvenience, and
  `PlatformSettingsController`'s own precedent (`inviteMembersEnabled` etc. take effect
  "immediately, no redeploy required") suggests this codebase doesn't treat admin-side disruption
  as something to route around.
  Prefer this. Recommend against a shim (see below).
- **Shim it.** `fromAccessTokenCookie` could check `access_token` for a `platform_admin`-typed JWT
  as *also* valid, for one deploy cycle — mirroring the exact pattern `proxy.ts`'s own
  `SESSION_HINT_LEGACY_TENANT_VALUE` already uses for a past migration. Adds a real, if small,
  amount of the original hazard back for the length of the shim (a stray old-cookie admin token
  could still collide with a tenant `access_token` cookie during the overlap window) — which
  undercuts the point of doing this at all. **Decided: not doing this** — see the Decisions
  section below.

### 5. The dual-identity question — needs a decision, not an assumption

Once login is split, nothing in the login mechanism itself forces one email to resolve to only
one of `platform_admins`/`users`. `assertEmailNotAPlatformAdmin`'s reason for existing (a shared
`login` that must pick exactly one table) goes away. Two paths, and this document is deliberately
not picking one:

- **Keep exclusivity as an explicit policy.** `assertEmailNotAPlatformAdmin` becomes a plain
  cross-table check with no login coupling behind it — still called from tenant `signup` and
  `completeGoogleSignup`, still mirrored by `AdminSettingsService.sendInvite`'s own
  `EMAIL_BELONGS_TO_TENANT_USER` check in the other direction. Simplest change: the method moves
  as-is, its doc comment gets rewritten to say "policy" instead of "correctness," and the
  lapsed-invite carve-out it currently needs (added on the invite branch specifically because a
  live invite is a real claim on an email) stays exactly as complex as it is today.
- **Relax it.** Drop the guard. The same email can be an admin and, separately, a tenant business
  owner — two unrelated accounts that happen to share a mailbox, the same way it's normal
  elsewhere (a personal Gmail can be a Google Workspace admin for one org and a plain member of
  another). Simpler code, but changes real product behavior — worth a support/ops sanity check on
  whether anything downstream (activity logs, a future admin-impersonation feature, anything
  keyed on "this email is unambiguous") assumes exclusivity.

**Decided: relaxed** — see the Decisions section below for what that removes and why the
exclusivity check was never actually needed once login stops being the thing forcing the choice.

## Frontend changes

- New `(auth)/admin-login` page — inherits `(auth)/layout.tsx`'s shared chrome (decorative
  background, language switcher, centered card), same as `/login`. Deliberately not
  `/admin/login`: that path sitting textually under `/admin/*` could visually suggest it's inside
  the guarded admin shell when it must be public. Reuses `PasswordAuthForm`, `AuthLogo`; no
  SSO/social button branching to inherit since the platform settings'
  `microsoftLoginEnabled`/`googleLoginEnabled` gate tenant-facing methods only — admin password login is
  unconditional today and this split doesn't change that.

  **Correction, applied during review:** the "no SSO/social button branching" line above was wrong
  for Google. An admin who accepted their invite through Google has no `password_hash` at all, so
  a password-only screen cannot sign them in — and `AdminSettingsService.updatePlatformSettings`
  already refuses to disable `googleLoginEnabled` on exactly the grounds that that button is "the
  only thing standing between them and no way in." A password-only `/admin-login` would have
  locked that class of admin out of the page built for them, leaving the tenant `/login` Google
  button as their only route in. The screen therefore carries a Google button gated on
  `googleLoginEnabled`, pointing at its own `GET /v1/admin/auth/google`
  (`OAuthIntent.ADMIN_LOGIN`) rather than the tenant route — that one falls through to the tenant
  tables when no admin identity matches, so the admin screen could hand back a *tenant* session,
  and it sends failures to `/login`, which carries no admin path.
- `LoginView` drops its `'admin' in result` branch and the `admin_success` `LoginResult` variant
  — it becomes purely the tenant screen it already mostly is.
- `AuthService` (web) gains `loginAsAdmin(email, password)` calling the new endpoint; the existing
  `loginWithPassword`'s `PlatformAdminTokenResponse` branch and `admin_success` kind are deleted.
- `proxy.ts`: add `/admin-login` (or wherever it lands) to `REDIRECT_IF_AUTHENTICATED_PATHS` and
  the matcher, mirroring `/login`'s own entries.
- `AdminGuard`, `TokenService.getTokenType()`, `usePlatformAdminProfile` — **unchanged**. They
  already read the JWT's own `type` claim and (post the invite-branch fix) probe the cookie
  directly rather than assuming a shared refresh path; none of that logic cares which cookie name
  or which login endpoint produced the token.
- The invite-accept page (`(auth)/invite/[token]`) needs its two API calls
  (`validateAdminInvite`/`acceptAdminInvite`) repointed at the new SDK operations once the backend
  routes move and the SDK is regenerated — no other change, since the page itself doesn't know or
  care which controller answers.

## Testing plan

- Backend: move the existing `platformAdminLogin`/invite-acceptance test blocks from
  `auth.service.spec.ts` to a new `platform-admin-auth.service.spec.ts` largely intact (they
  already mock only admin-domain dependencies). Add: `fromAccessTokenCookie` checking both cookie
  names: `admin_session.spec.ts`-style test that a tenant `access_token` cookie is never read as
  an admin token and vice versa (each has its own `type` claim regardless, but the extractor
  itself should be tested for "reads whichever is present, prefers neither incorrectly").
- A live-Postgres/live-server run of the full `POST /v1/admin/auth/login` → cookie inspection →
  the same replay/lockout assertions the invite branch already proved for the old route, now
  against the new one — same method this session used twice already (the accept-invite live run,
  and the Google-mock live run), not just unit mocks.
- Frontend: `RequireAuth`/`AdminGuard`/`RedirectIfAuthenticated` test suites need no logic changes
  but should be re-run to confirm the cookie-name split doesn't silently change what they observe
  in a test environment that stubs cookies by name.

## Rollout sequencing

Backend and frontend must deploy together (or backend first with a brief `/admin/login` 404
window) — the frontend admin-login page depends on the new route existing, and the old
`'admin' in result` branch on `POST /v1/auth/login` should be removed from the backend only after
the frontend stops calling it, or a short window exists where both old and new admin-login paths
work simultaneously. Given this is one seeded root admin today, the simplest sequencing is: merge
backend + frontend in one deploy, treat the forced re-login as expected, skip the migration shim
from §4.

## Effort estimate

Roughly a day of mechanical work once this document is confirmed: new controller/service pair
(mostly moved code), cookie extractor + constant, one new frontend page, `proxy.ts`/`LoginView`
trims, SDK regeneration, and re-running the existing test suites through the move. The Google
callback composition (§2) is the one piece that's a genuine refactor rather than a move, and is
where I'd expect any real surprises.

## Decisions

1. **Migration shim (§4): skipped.** Existing admin sessions are signed out on deploy; no
   backward-compat cookie acceptance window.
2. **Dual-identity policy (§5): relaxed.** `assertEmailNotAPlatformAdmin` is removed rather than
   kept as an explicit policy check — once login is split, the same email may exist as both a
   platform admin and a tenant business owner. Concretely, this means:
   - `AuthService.signup`, `completeGoogleSignup` no longer call it. The corresponding backend
     spec cases (`auth.service.spec.ts`'s "refuses an email that already belongs to a ...
     platform admin" tests, both the loggable-in and lapsed-invite variants) are deleted, not
     ported — they test a guard that no longer exists.
   - `AdminSettingsService.sendInvite`'s own `EMAIL_BELONGS_TO_TENANT_USER` check (the mirror, in
     the other direction) was initially kept here, on the reading that it was a separate business
     rule rather than a login-correctness mechanism. **Revised during review: it is removed too.**
     Keeping it made the relaxation one-directional — an admin's address could sign up as a
     tenant, but an existing tenant could never be invited as an admin, which is the direction
     that actually matters when staffing the console from people who already use the product. Its
     stated justification was the same shadowing problem `assertEmailNotAPlatformAdmin` existed
     for, and that is gone for the same reason. The message, the `AdminUsersDbService` dependency
     it needed, and `existsByEmail` (whose only caller it was) are deleted along with it.
   - `AuthDbService.findPlatformAdminForLogin`'s use inside tenant `login`/`signup` was the only
     *structural* reason exclusivity existed; once `POST /v1/admin/auth/login` is its own route
     querying only `platform_admins`, tenant `login` has no reason to consult that table at all
     and this lookup can be deleted from the tenant path entirely (it was never needed for
     anything but the guard being removed).
3. **Admin-login page location: `(auth)/admin-login`.** Inherits the existing `(auth)/layout.tsx`
   shell (decorative background, language switcher, centered card) — same chrome `/login` already
   uses, so this is a routing/content change only, not a new layout.

## Found in review

Issues this document's original plan did not anticipate, caught reviewing the implementation.
Each is fixed in the same change unless noted.

1. **Cookie preference order is load-bearing, and route-aware.** The plan said the extractor could
   check the two cookie names in either order because "a browser only ever carries the one that
   matches its own signed-in principal." Giving admins their own cookie name is precisely what
   makes that false. A fixed preference for `access_token` 403'd every admin-route request from a
   browser that also held a tenant session. `fromAccessTokenCookie` now picks by request path, and
   `jwt-cookie-extractor.util.spec.ts` sweeps the real controllers to pin the URL coupling.
2. **Unauthenticated `/admin/*` must bounce to `/admin-login`.** `proxy.ts` sent it to `/login`,
   which since this split has no admin path on it — a dead end.
3. **Logout must return an admin to `/admin-login`.** Same dead end, one layer up: the admin
   console shares `AppShell`, whose Sign out called `AuthService.logout()`, which always redirected
   to `/login`. It now reads the token's `type` claim before clearing.
4. **The per-account lockout must be scoped per principal.** `LoginAttemptService` keyed purely on
   the email hash while both login routes shared it. Once one address can hold both identities, a
   successful *tenant* login `reset()` wiped the counter guarding the *admin* password — so anyone
   holding the self-service tenant password could clear the admin lockout after each failed batch
   and brute-force it, leaving only the per-IP throttle. Keys are now
   `auth:login-fail:{tenant|admin}:<hash>`.

### Deferred: session coexistence is cookie-deep only

The credential cookies coexist, but `TokenService` (web) keeps the access token in a single
`access-token` localStorage slot shared by both principals, and `useAuthToken` — which feeds
`AdminGuard`, `RequireAuth` and `RedirectIfAuthenticated` — reads it. Signing into the second
principal overwrites the first's slot, so **in the browser UI only the most recently signed-in
principal is usable**, even though both cookies are alive and both work at the API layer.

This also blocks scoping logout per principal (clearing only the cookies of whoever signed out).
Doing that today would leave the surviving session with a live cookie and session hint but no
localStorage token — guards and edge middleware disagreeing, which is the exact
`/login` ↔ `/dashboard` redirect-loop class this codebase has already fixed twice. A tenant
session would self-heal via `refreshSession()`; an admin one has no refresh token and would not.

Making coexistence real means keying the client-side token per principal (`access-token:tenant` /
`access-token:admin`) and teaching the guards and the api-sdk interceptor which slot applies —
worth doing before advertising coexistence as a feature, and a separate change from this one.
