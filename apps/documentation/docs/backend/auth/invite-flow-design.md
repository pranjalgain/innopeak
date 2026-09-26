# Platform admin invite flow — design

**Status:** design, pending implementation on `feat/admin-invite-flow`.

## Why

`AdminSettingsService.sendInvite` already creates the invited admin's row and its
`platform_admin_invites` token row, but throws the raw token away instead of emailing it, and
nothing exists to redeem it. An invited admin sits in the roster forever with no way to finish
onboarding. This closes that gap: the invite gets emailed, a public accept screen lets the
invitee set a password, and the admin becomes `active`.

Per this session's request: **when `NODE_ENV=development`, the invite link is also written to
the server log**, so the flow is exercisable locally without a working mailbox — the same spirit
as `NoopEmailProvider`, which already logs "would have sent to X" in every non-production
environment.

No database migration is needed. `platform_admin_invites` (token_hash, purpose, expires_at,
used_at) and `platform_admins.status` already support this end to end.

## Scope

Platform admin → platform admin invites only (`/v1/admin/settings/invites`). Tenant/team-member
invites are a separate, not-yet-built feature (`TokenPurpose.INVITE` on `password_reset_tokens`
has zero usages) and are out of scope here.

Backend endpoints + web accept page, both in this branch.

## Backend

### 1. Send the invite email (fixing `AdminSettingsService.sendInvite`)

`sendInvite` already mints `rawToken` before hashing it into `tokenHash`. Today `rawToken` is
discarded after `hashToken(rawToken)`. Change:

- Build `inviteLink = `${frontendUrl}/invite/${rawToken}`` using `FRONTEND_URL` (same config key
  `ConnectionsService` already reads, same `.replace(/\/$/, '')` trim).
- Enqueue a new job (see §2) carrying `inviteLink`, fire-and-forget, same shape as
  `AuthService.sendOtpEmail` (`void this.queueManager....catch(() => undefined)`).
- When `!isProduction()` (the codebase's one dev/prod gate — `NODE_ENV` only validates to
  `development`/`production`, so this is exactly `NODE_ENV === 'development'`), additionally log
  the invite link directly via `Logger.log`, e.g.:
  `Admin invite for ${dto.email}: ${inviteLink} (dev only — not read from the queued email job)`.
  This is a deliberate, explicit statement — not a debug-level payload dump — mirroring the
  `NoopEmailProvider`'s own dev-only logging.
- `AdminSettingsService` gains two new constructor deps: `AddingJobsToQueueManager` (needs
  `AdminModule` to import `QueueUIModule`, same as `AuthModule` already does) and
  `ConfigService<EnvConfig>`.
- Update the method's doc comment — it currently says "does **not** email it or expose an
  accept-invite endpoint yet"; both become false.

### 2. New job / template — don't reuse `IOtpEmailJob`

`IOtpEmailJob` already has unused `passwordResetLink`/`passwordSetLink` fields, but this isn't an
OTP email, and piggybacking would keep spreading one interface across unrelated flows.

- `JobName.ADMIN_INVITE_EMAIL = 'admin-invite-email'` in `job.constant.ts`.
- New `IAdminInviteEmailJob extends IEmailJob { inviteLink: string; expiresIn?: string }` in
  `job.interface.ts`.
- `AddingJobsToQueueManager.addAdminInviteEmailJob(jobName, data)` → `addJob(QueueName.EMAIL, ...)`.
- `EmailProcessor`'s switch gains `case JobName.ADMIN_INVITE_EMAIL:` →
  `emailQueueService.sendAdminInviteEmail(...)`.
- `EmailQueueService.sendAdminInviteEmail(data)` → `emailService.sendTemplateEmail(data.email,
  'admin-invite', {...}, { subject: 'You've been invited to <App>' })`.
- New template `src/email/templates/admin-invite.hbs`, same visual shell as
  `reset-password.hbs` (header/body/cta/footer), with `{{inviteUrl}}`, `{{expiresIn}}`,
  `{{appName}}`, `{{year}}`.

### 3. Fix the existing debug-log leak this new field would otherwise hit

`EmailProcessor.process` still does `JSON.stringify(job.data)` at `debug` level before the
switch — the exact leak `queue-add-manager.ts`'s own comment describes (a debug-enabled
environment logs the full payload, secrets included). `DeadLetterQueueService.redactSecrets`
already exists for the DLQ path but not this one. Extract it to a small shared
`redactJobSecrets(data: unknown): unknown` helper (strip `otp`, `inviteLink`) used by both
`EmailProcessor`'s debug line and `DeadLetterQueueService`, so the new `inviteLink` field is
covered everywhere a job payload is ever logged, not just the one path this feature touches.

### 4. Consuming a token — `PlatformAdminRepository` / `PlatformAdminDbService`

New repository methods, alongside the existing `insertInviteToken`/`findByEmail`:

```ts
// Repository
async findInviteEmailByTokenHash(tokenHash: string): Promise<{ email: string } | null>
// SELECT platform_admins.email FROM platform_admin_invites JOIN platform_admins ...
// WHERE token_hash = $1 AND purpose = 'invite' AND used_at IS NULL AND expires_at > now()

async acceptInvite(input: { tokenHash: string; passwordHash: string }): Promise<AcceptInviteOutcome>
// transaction:
//  1. SELECT id, platform_admin_id FROM platform_admin_invites
//     WHERE token_hash = $1 AND purpose = 'invite' AND used_at IS NULL AND expires_at > now()
//     FOR UPDATE   -- not found -> { outcome: 'invalid' }
//  2. UPDATE platform_admins SET password_hash = $2, status = 'active', updated_at = now()
//     WHERE id = $platformAdminId AND status = 'invited'
//     RETURNING id, email                          -- 0 rows -> { outcome: 'invalid' } (race)
//  3. UPDATE platform_admin_invites SET used_at = now(), updated_at = now() WHERE id = $inviteId
//  4. return { outcome: 'accepted', id, email }
```

```ts
export type AcceptInviteOutcome =
  | { outcome: 'accepted'; id: string; email: string }
  | { outcome: 'invalid' };
```

Both outcomes collapse to one generic message at the service layer (`INVALID_OR_EXPIRED_INVITE`)
— same enumeration-avoidance shape as `INVALID_OR_EXPIRED_OTP`, since distinguishing "never
existed" from "already used" from "expired" tells a prober which guess was closest.

`PlatformAdminDbService` gets thin `findInviteEmailByTokenHash` / `acceptInvite` pass-throughs,
same pattern as its existing methods.

### 5. Public endpoints — on `AuthController`, not `AdminSettingsController`

`AdminSettingsController` is class-decorated `@Roles(JwtTokenType.PLATFORM_ADMIN)` — wrong home
for a route the invitee (not yet authenticated as anything) must call. `AuthController` already
hosts every other public identity-establishing route (signup, login, verify-email, Google). This
also matches what `api-reference.md` already speculatively documented
(`/v1/auth/invite/*`) — this branch fills in the platform-admin-only implementation of it.

New `RouteNames`:
```ts
INVITE_VALIDATE = 'invite/:token',   // GET  /v1/auth/invite/:token
INVITE_ACCEPT = 'invite/accept',     // POST /v1/auth/invite/accept
```

```ts
@Get(RouteNames.INVITE_VALIDATE)
@Public()
@Throttle({ short: { limit: 20, ttl: 60000 } })
@ApiValidateAdminInvite()
async validateAdminInvite(@Param('token') token: string): Promise<ApiResponse<AdminInvitePreviewDto>>

@Post(RouteNames.INVITE_ACCEPT)
@Public()
@Throttle({ short: { limit: 5, ttl: 60000 } })
@HttpCode(HttpStatus.OK)
@ApiAcceptAdminInvite()
async acceptAdminInvite(
  @Body() dto: AcceptAdminInviteDto,
  @Res({ passthrough: true }) res: Response
): Promise<ApiResponse<PlatformAdminTokenResponseDto>>
// same setAdminSessionCookies(...) call login's admin branch already uses
```

New DTOs (`src/api/auth/dto/`):
- `AdminInvitePreviewDto { email: string }` — GET response, so the accept screen can render
  "You've been invited as `<email>`" without trusting anything client-supplied.
- `AcceptAdminInviteDto { token: string; password: string }` — POST body. `password` reuses
  `PASSWORD_PATTERN`/length rules and custom messages, same shape as `SetPasswordDto.newPassword`.

`AuthService` additions (new constructor dep: `PlatformAdminDbService`, already `@Global()` —
no module wiring needed):

```ts
async validateAdminInvite(rawToken: string): Promise<AdminInvitePreviewDto> {
  const invite = await this.platformAdminDbService.findInviteEmailByTokenHash(hashToken(rawToken));
  if (!invite) throw new NotFoundException(MESSAGES.AUTH.INVALID_OR_EXPIRED_INVITE);
  return AdminInvitePreviewDto.from(invite);
}

async acceptAdminInvite(dto: AcceptAdminInviteDto): Promise<PlatformAdminLoginResult> {
  const passwordHash = await this.hashingService.hash(dto.password);
  const result = await this.platformAdminDbService.acceptInvite({
    tokenHash: hashToken(dto.token),
    passwordHash,
  });
  if (result.outcome === 'invalid') {
    throw new BadRequestException(MESSAGES.AUTH.INVALID_OR_EXPIRED_INVITE);
  }
  const { accessToken, expiresIn } = this.tokenService.signPlatformAdminAccessToken(result);
  // ...assemble PlatformAdminLoginResult, same construction `platformAdminLogin` already does
}
```

### 6. Guard fix this reopens: `assertEmailNotAPlatformAdmin`

This guard's own comment currently justifies keying on `passwordHash` being set (not merely a row
existing) specifically *because* "an invited admin has no accept-invite flow to ever turn that row
into a real, loggable-in identity." Once §5 ships, that premise is false: a signed-up tenant and
an accepted admin could both exist for one email, breaking the "no email resolves to two
authenticatable identities" invariant this guard exists to protect.

Fix: block tenant signup for any admin row that isn't a **lapsed** invite — reusing exactly the
lapse definition `AdminSettingsService.sendInvite` already applies (`status === INVITED &&
inviteExpiresAt` in the past). A live invite (unexpired, unaccepted) must block signup — accepting
it, not signing up, is this address's way in. A lapsed one is a dead claim, same as today.

```ts
private async assertEmailNotAPlatformAdmin(email: string): Promise<void> {
  const admin = await this.authDbService.findPlatformAdminForLogin(email);
  if (!admin) return;
  if (admin.passwordHash) throw new ConflictException(MESSAGES.AUTH.EMAIL_ALREADY_REGISTERED);

  const invite = await this.platformAdminDbService.findByEmail(email);
  const isLapsed =
    invite?.status === PlatformAdminStatus.INVITED &&
    invite.inviteExpiresAt !== null &&
    new Date(invite.inviteExpiresAt).getTime() <= Date.now();
  if (!isLapsed) throw new ConflictException(MESSAGES.AUTH.EMAIL_ALREADY_REGISTERED);
}
```

### 7. New messages (`AUTH`, en + de)

- `INVALID_OR_EXPIRED_INVITE` — "This invite link is invalid or has expired." /
  "Dieser Einladungslink ist ungültig oder abgelaufen."
- `INVITE_ACCEPTED` — "Invite accepted. You're signed in." /
  "Einladung angenommen. Du bist angemeldet."

## Frontend (`apps/web`)

1. ~~Regenerate the SDK~~ **Done.** `pnpm generate:client` against a live backend added
   `authControllerValidateAdminInviteV1` (`AxiosPromise<AdminInvitePreviewDto>` — a real model) and
   `authControllerAcceptAdminInviteV1` (`AxiosPromise<void>` — the success envelope was never given
   a `type:` on the backend's `@ApiResponse`, so `PlatformAdminTokenResponse` stays hand-typed and
   asserted onto it, same workaround `authControllerLoginV1`'s admin branch already uses). The web
   service initially called both via raw `axios` as a stopgap while Docker was down; swapped over
   to the generated methods once it came back up. Verified live end-to-end against the running
   backend + Postgres: preview → accept → replay correctly 400s → preview correctly 404s
   afterward → login with the newly-set password succeeds. `inviteGoogleAuthorize` needs no SDK
   entry at all — it's a full-page redirect, same as the existing Google login/signup buttons.
2. `apps/web/src/app/_libs/services/auth.service.ts` — `validateAdminInvite(token)`,
   `acceptAdminInvite(token, password)`, same `unwrap`/`ApiError` pattern as every other method
   there.
3. New route `apps/web/src/app/(auth)/invite/[token]/page.tsx` (+ a `_components/accept-invite-view.tsx`),
   same visual shell as `LoginView` (`AuthLogo`, the card, `PasswordAuthForm`'s password-field
   styling). On mount: call `validateAdminInvite(token)`; show the invited email once it resolves,
   a "this link is invalid or has expired" state on 404, a password + confirm-password form
   otherwise. On submit: `acceptAdminInvite`, then `router.push(ROUTES.ADMIN)` (cookies are set by
   the backend response, same as every other session-issuing call already going through
   `apiConfig`'s `withCredentials`).
4. New hook, e.g. `apps/web/src/hooks/auth/use-accept-admin-invite.ts`, a `useMutation` wrapping
   step 2 — no query-key invalidation needed (this is a brand-new session, not a refetch of
   existing cached data).
5. `messages/en.json` + `messages/de.json` — new `auth.acceptInvite.*` keys: title, "invited as"
   copy, password/confirm labels, submit label, invalid/expired state, generic error toast.

## Addendum: Google SSO on accept

Confirmed with the user: the accept screen also offers "Continue with Google" as an alternative
to setting a password, using `platform_admin_identities` (schema existed, with zero usages
anywhere, before this). Tenant/team-member invites (`TokenPurpose.INVITE` on
`password_reset_tokens`, currently mock-only on web) are explicitly **out of scope** for this
branch — tracked as a separate follow-up task.

**Writing that identity row is only half of it.** Nothing read `platform_admin_identities`, so the
first cut of this let a Google-accepted admin sign in exactly once: no `password_hash` to log in
with, no refresh token for this principal type, and neither `revokeInvite` nor a re-invite
available afterwards (both are scoped to `status = 'invited'`) — a permanent lockout recoverable
only by hand in SQL. The shared Google callback therefore also resolves a linked admin identity on
plain `login`/`signup` round trips (`PlatformAdminRepository.findByGoogleIdentity`), signing that
admin in and taking the request exclusively — the same rule password `login` already applies by
checking `platform_admins` first.

**Two browser-side consequences, both found in review and fixed.**

1. *The session never survived the redirect.* A Google-accepted admin arrives from a server-side
   redirect, so their session exists only in httpOnly cookies — localStorage is empty. `AdminGuard`
   read that as "signed out" and asked `useAuthToken({ reviveMissing: true })` to recover, which
   calls `/v1/auth/refresh`; an admin has no refresh token, and `AuthController.refresh` *clears*
   `access_token` and the session hint when it finds no refresh cookie. The check destroyed the
   session it was verifying, bounced the admin to `/login`, and — having no password — left the
   Google button as their only retry, which repeated the cycle. The guard now keeps the local
   check offline (`reviveMissing` off, no request, no cookie clearing) and hands the cookie-only
   case to `PlatformAdminProfileService.probeSession`, an authenticated round trip that `JwtStrategy`
   answers off the cookie. Tenants keep the refresh path, which for them both proves the session
   and repairs localStorage.
2. *The accept screen ignored `socialLoginEnabled`.* `LoginView` gates its Google button on that
   platform setting; the invite screen did not, so an invitee could mint a Google-only admin on a
   platform where Google sign-in is switched off — an account whose one credential is a button
   `/login` never renders. The accept screen now reads the same setting.

3. *Disabling Google afterwards stranded them.* The two fixes above stop a Google-only admin being
   *created* while Google sign-in is off, but an admin who accepted earlier was still locked out
   the moment a Super Admin switched it off later — no password to fall back on, and no admin
   equivalent of the tenant `set-password` flow to add one with.
   `AdminSettingsService.updatePlatformSettings` now refuses that change while any active admin has
   Google as their only credential (`countActiveGoogleOnlyAdmins`), naming how many would be
   stranded. That is the third member of a family this service already had — the "at least one
   sign-in method" check beside it, and `setAdminStatus`'s last-active-admin and
   cannot-disable-self guards — all of which exist to stop a settings change locking the platform
   out of its own console.

   Scoped to the *transition*, so re-asserting `false` when Google is already off stays a no-op:
   an admin stranded by that pre-existing state is recovered by turning it back on, and answering
   400 to a no-op would make that state look like the guard's doing. Read-then-write, like the
   check beside it — an invite accepted through Google in the window between the count and the
   UPDATE would slip past. Documented rather than locked down: the invariant spans two tables so
   no single-table CHECK can back it up, and the consequence is one admin re-enabling a setting.

Worth knowing, and unchanged by any of this: `socialLoginEnabled` is enforced **only in the UI** —
no backend auth path consults it, so `GET /v1/auth/google` still works when it is off. The guard
above is about the login screen being usable, not about a security boundary.

This mirrors the single-callback-per-provider dispatch `handleGoogleCallback` already uses for
`OAuthIntent.LOGIN`/`SIGNUP` — a third intent, not a new callback route:

- `OAuthIntent.ADMIN_INVITE` — new enum member.
- `GoogleAuthStateRecord` gains an optional `inviteToken?: string`, and
  `GoogleOAuthStateService.mint` an optional `inviteToken` input — carried server-side in Redis,
  never round-tripped through the client beyond the opaque signed `state`.
- New route `GET /v1/auth/invite/:token/google` (`@Public()`): re-validates the token read-only
  (`findInviteEmailByTokenHash`, no mutation) so a dead link fails before ever redirecting to
  Google, then mints state with `intent: ADMIN_INVITE, inviteToken: token` and redirects — same
  shape as `buildGoogleAuthorizeRedirect`, returning a small `AdminInviteGoogleAuthorizeRedirect`
  union instead of throwing (the browser is mid-navigation).
- `handleGoogleCallback` branches on `consumed.record.intent === OAuthIntent.ADMIN_INVITE` (after
  the existing intent-agnostic checks: state validity, `error`, `code` present, `emailVerified`)
  into a new private `completeAdminInviteGoogle(inviteToken, identity)`:
  1. Re-look-up the invite by token to get the invited email.
  2. **`INVITE_EMAIL_MISMATCH`** if `normalizeEmail(identity.email) !== normalizeEmail(invite.email)`
     — the check that stops someone else's Google account from redeeming a link meant for this
     address. Borrowed directly from this same document's own earlier (never-built) design for the
     tenant-member SSO-invite path.
  3. `PlatformAdminRepository.acceptInviteWithGoogleIdentity({ tokenHash, providerUserId })` —
     same transaction shape as the password path (`acceptInviteWithPassword`), except it inserts a
     `platform_admin_identities` row instead of writing `password_hash`. A unique-violation on
     `(provider, provider_user_id)` — this Google account already linked to a *different* admin —
     maps to a new `outcome: 'identity_already_linked'`, not the generic invalid/expired case.
  4. On success, `TokenService.signPlatformAdminAccessToken` + `setAdminSessionCookies`, redirect
     to the admin dashboard — new `GoogleCallbackOutcome` variant `kind: 'admin_signed_in'`.
- Failure redirects for this intent target `${FRONTEND_URL}/invite/:token?error=<code>` (the same
  accept page, not `/login`/`/onboarding/signup`) — new `GoogleAuthFailure` codes
  `INVALID_OR_EXPIRED_INVITE` and `INVITE_EMAIL_MISMATCH`, alongside the existing
  `PROVIDER_ERROR`/`ACCESS_DENIED`/`EMAIL_NOT_VERIFIED`/`NOT_CONFIGURED`.
- `platform_admin_identities` has no `email` column (unlike `user_identities`), so the IdP-reported
  email is never persisted — only used for the one-time mismatch check. Acceptable: the row of
  record for the admin's email stays `platform_admins.email`, and no other code reads an identity
  row's email today. Flagged, not fixed, as a possible follow-up migration if that changes.
- Web: the invite accept page renders both options — a password form and a "Continue with Google"
  button (reusing `SocialAuthButtons`) — same layout `LoginView` already uses to combine the two,
  and reads `?error=` the same way `useOAuthErrorToast` already does for login/signup.

## Testing plan

- Backend: unit specs for `PlatformAdminRepository.acceptInvite`/`findInviteEmailByTokenHash`
  (valid, expired, already-used, wrong-token), `AuthService.validateAdminInvite`/
  `acceptAdminInvite`, the updated `assertEmailNotAPlatformAdmin` (live invite blocks signup,
  lapsed invite doesn't, active/disabled admin blocks signup), `AdminSettingsService.sendInvite`'s
  new email-job + dev-log calls (queue manager called with the right job name/payload; dev log
  only asserted when `!isProduction()`).
- ~~One live-Postgres run of the new `acceptInvite` transaction~~ **Done**, against the running
  backend rather than raw SQL: inserted an invite row directly, then drove it through the real
  `GET /v1/auth/invite/:token` → `POST /v1/auth/invite/accept` → `POST /v1/auth/login` sequence
  over HTTP. Confirmed the guarded compare-and-swap actually closes the replay window (a second
  accept with the same token 400s), the preview 404s once spent, and the newly-set password
  authenticates — not just that the transaction returns the right TypeScript shape under mocks.
- Frontend: no new unit tests expected beyond what the hook/service pattern already gets
  incidentally from existing suites; manual verification via the dev-logged invite link.

## Docs to update once implemented

- `apps/documentation/docs/backend/auth/api-reference.md` — replace the speculative
  `/v1/auth/invite/*` section with the actual implemented contract (admin-only, no
  `INVITE_TOKEN_TTL_HOURS` — the real TTL is `AdminSettingsService.INVITE_TTL_DAYS = 7`).
- `apps/documentation/docs/backend/auth/overview.md` — the route table + token-purpose narrative.
- `apps/documentation/docs/backend/platform-admin/overview.md` — flip "Designed, deferred" to
  "Implemented" for this row.
- `apps/backend/CLAUDE.md` — Auth Flows list gains the invite-accept entry.
- This file (`invite-flow-design.md`) can be deleted once the above are updated, or kept as
  historical design context — team's call.
