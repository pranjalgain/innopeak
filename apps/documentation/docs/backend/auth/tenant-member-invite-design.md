# Tenant member invite + accept — design

Branch: `feat/tenant-invite-flow`, off `development` (which already includes the platform-admin
login split — `separate-admin-login-design.md`). Status: **implemented and live-verified** — see
"Decisions" at the end for what was decided, and "Found during implementation" below for what
changed along the way.

## Found during implementation

- **Revoke vs. accept deadlock risk.** `AuthRepository.deleteInvitedMember` originally deleted
  straight from `users` and relied on `ON DELETE CASCADE` to remove the matching
  `password_reset_tokens` row — the opposite lock order from the accept path
  (`lockLiveMemberInvite` locks the token row first, then updates `users`). Two transactions
  taking the same two locks in opposite orders is Postgres's textbook deadlock shape: an owner
  revoking an invite at the exact moment the invitee is mid-accept could abort one side with a raw
  `deadlock detected` instead of the clean 409/400 either path is supposed to return. Fixed by
  deleting the token row explicitly, first, in the same transaction — matching accept's own order.
  The identical risk exists in the pre-existing `PlatformAdminRepository.deleteInvitedAdmin` vs.
  `acceptInviteWith*` (the template this flow mirrored) — tracked as a separate follow-up.
- **`DashboardLayout`'s role badge was hardcoded to "Owner".** Every tenant user before this
  feature *was* an owner, so `roleLabel: t("accountOwnerRole")` was never visibly wrong. The first
  real `role: "member"` user this app ever produced (accepting a live invite in the browser)
  surfaced it immediately — the sidebar showed an invited teammate as "Owner". Fixed by threading
  `role` through `TenantOwnerProfile`/`TenantOwnerProfileService.get()` (both already had every
  other field this needed) and adding an `accountMemberRole` label.
- Live-verified end-to-end against the real backend (not just unit mocks): send/list/revoke
  invites including the 403 (disabled), 409 (live invite / already-registered-elsewhere), 404 and
  cross-tenant-isolation cases; password accept issuing a real 7-day refresh token (unlike the
  admin flow, which has none); Google accept success, email-mismatch (token left unconsumed), and
  a from-scratch passwordless Google-only member signing in with no other credential; the
  `@Roles(UserRole.OWNER)` guard rejecting a member's own attempt to invite or list; and the full
  Settings → Members UI (invite form, live list update, revoke confirmation dialog) in a real
  browser session.
- **MR review (against `development`) found and fixed five more issues**, all live-verified:
  - **Cross-tenant invite destruction.** `deleteInvitedMember`'s token-row delete filtered on
    `user_id` alone, not tenant — an owner revoking *another* tenant's invitee id got the correct
    404 (the `users` delete was already tenant-scoped), but the token row was gone by then anyway,
    permanently killing a pending invite in a tenant the caller has no access to. Fixed by scoping
    the token delete through the same tenant check, via a subquery, without disturbing the
    token-before-user lock order the deadlock fix above depends on.
  - **Invites stuck forever after the nightly sweep.** Adding `TokenPurpose.INVITE` to
    `PURGEABLE_OTP_PURPOSES` meant the daily `AUTH_TOKEN_CLEANUP` cron deletes an expired invite's
    token row while leaving the `users` row `invited` — and `sendInvite`'s `isLapsedInvite` check
    read that row's now-`null` expiry as "not an invite at all" rather than "lapsed", so the
    address was stuck behind a permanent 409 with no live invite anyone could revoke. Fixed by
    treating a `null` expiry on an `invited` row as lapsed, not live.
  - **`invited_by_user_id` was declared, threaded through three layers, and never written** — the
    `insertInvitedMember` `.values()` call simply omitted it. Fixed; confirmed non-null in the DB.
  - **`deleteExpiredMemberInvite` still had the pre-fix lock order** (cascade off the `users`
    delete) — the exact ordering the deadlock fix above eliminated everywhere else. Wasn't the
    original deadlock's trigger (it races an *accept*, not another revoke), but the invariant
    "every writer of this table pair takes the same lock order" only holds if every writer
    actually does. Fixed the same way.
  - **A suspended tenant's invite could still be redeemed.** Both accept paths only checked
    tenant standing at the very end, inside `buildTokenIssuanceResult` — reaching that check meant
    the invite had already been consumed and the member already activated. On the Google path this
    was worse: a thrown `ForbiddenException` from the shared, browser-mid-navigation callback
    painted a raw JSON 403 instead of a redirect. Fixed by checking standing *before* redemption on
    both paths — password throws before writing, Google returns an `ACCOUNT_UNAVAILABLE` redirect.
  - Frontend: no tenant-member role gating existed anywhere — this was the first feature to make a
    non-owner tenant user possible, and `role` was read only for a display label. A member opening
    Settings saw every owner-only tab (all reading `GET /v1/settings`, `@Roles(OWNER)`); worse,
    `useSettings()`'s query stayed disabled-but-still-gating for one, so the page's own loading
    skeleton never resolved. A member accepting before the owner connects a business also hit an
    unrecoverable loop — `ConnectionGuard` sent them to the connect stepper, every route on which
    is owner-only. Fixed: Settings now offers a member only the Profile tab (or a plain "nothing to
    configure" message if password login is off platform-wide), and `ConnectionGuard` shows a
    member a "waiting on the owner" screen instead of the stepper.
  - Smaller fixes: the accept screen treated any validation failure (a network drop, a 5xx, the
    validate route's own rate limit) the same as a dead token, showing the same no-retry dead end;
    now only a 404 does that, everything else offers a retry. The password requirements checklist
    covered every rule except the max-length one, so exceeding it left the form invalid with
    nothing visible explaining why. `useTenantMembers`'s optimistic invite update replaced the
    whole cache with a one-element array whenever the roster hadn't loaded yet (mirroring a bug
    already fixed in the admin equivalent); both mutations now also invalidate the roster query, the
    only way an invitee's acceptance elsewhere ever reaches an owner's already-open tab. The invite
    token travelled in the request-log's raw URL, and the Google OAuth `code`/`state` travelled the
    same way in the callback URL — both bypassed the logging interceptor's field-level redaction,
    which only ever reached the parsed body/query, never the raw path string; fixed for both.
    Finally, the invite email never named the inviting business ("join a team" for every sender) and
    shared the admin invite's exact subject line, so a mail client would thread the two together —
    now the tenant name flows through the job into both the subject and the body.

## Why

A tenant owner today has no way to bring a teammate into their business. Every `users` row comes
from `POST /v1/auth/signup` as `role = 'owner'` — there is no code path anywhere that inserts a
`role = 'member'` row. The frontend disagrees with that: `apps/web/src/app/(dashboard)/settings/`
already has a full "Team members" section — invite form, member list, revoke-invite dialog,
pagination — gated behind `platformSettings.inviteMembersEnabled`, entirely backed by
`TenantMemberService`'s in-memory mock array. Its own doc comment says what it's waiting for:
*"Mock implementation — becomes a real backend call once the auth module exists."* The auth module
exists now. This is that backend, plus wiring the existing frontend to it.

`invite_members_enabled` (`platform_settings`, migration `0009`) is already fully plumbed
end-to-end — `GET /v1/settings/platform-config` → `usePlatformSettings()` → the Members tab's
visibility — but has **zero backend enforcement** today. Nothing stops `POST /v1/auth/signup` or
any other route from acting regardless of the flag; it only ever hid a UI tab. This work is also
where that flag starts meaning something server-side.

## What's not changing

- **`users` schema.** `invited_by_user_id` (self-FK, nullable) and `UserStatus.INVITED` already
  exist — added in `0002_tenant_auth.sql` with a doc comment describing exactly this feature
  ("set only when a member is invited by an owner... the only case where the inviter genuinely is
  another users row"). No migration needed for the `users` table itself.
- **Tenant login/signup/refresh/OTP.** An invited member signs in through the same
  `POST /v1/auth/login` every tenant user already uses, once their row is `active`. No new token
  type, no new cookie, no new guard — `JwtStrategy`/`RolesGuard`/`@Roles(UserRole.MEMBER)` already
  handle a `member` role the moment one exists.
- **The dual-identity relaxation from the admin-login split.** An email that belongs to a platform
  admin can already sign up as a tenant (`assertEmailNotAPlatformAdmin` is gone); this means a
  tenant invite needs no reciprocal check against `platform_admins` either. The only uniqueness
  this has to respect is the one that already exists: `idx_users_email_active`
  (`0007_auth_hardening.sql`) — one *active* account per email, globally, across every tenant. An
  invite targeting an email already active anywhere hits that constraint and must be rejected
  before insert, the same shape `AuthService.signup`'s own `EMAIL_ALREADY_REGISTERED` 409 already
  handles.
- **The platform-admin invite flow itself.** `PlatformAdminAuthController`, its
  `/v1/admin/auth/invite/*` routes, and `(auth)/invite/[token]`/`AcceptInviteView` are untouched.
  This is a parallel flow, not a shared one — see naming below for why the route *names* still
  line up.

## The pattern being mirrored, and where it diverges

The admin invite flow (`PlatformAdminAuthService`, `AdminSettingsService.sendInvite`,
`platform_admin_invites`) is the closest sibling and the template for most of this. Concretely:

| | Platform admin | Tenant member |
|---|---|---|
| Invite row lives on | dedicated `platform_admin_invites` table | **reuses `password_reset_tokens`, `purpose = 'invite'`** — see below |
| Invitee row created at | send-time, `status = 'invited'`, no `password_hash` | same |
| Token shape | `randomBytes(32).toString('base64url')`, hashed with `hashToken()` (SHA-256) | same — `hashToken`'s own doc comment already reads *"raw verify/invite/reset token"*, anticipating this reuse |
| Expiry | 7 days (`INVITE_TTL_DAYS`) | same constant, same default |
| Preview route | `GET /v1/admin/auth/invite/:token` → `{ email }` | `GET /v1/auth/invite/:token` → `{ email }` |
| Accept (password) | `POST /v1/admin/auth/invite/accept` → `{ token, password }` | `POST /v1/auth/invite/accept` → `{ token, name, password }` — **name is new**, see Decision 1 |
| Accept (Google) | `GET /v1/admin/auth/invite/:token/google`, `OAuthIntent.ADMIN_INVITE` | `GET /v1/auth/invite/:token/google`, `OAuthIntent.INVITE` — see Decision 4 |
| Send route, gated by | `@Roles(PLATFORM_ADMIN)` | `@Roles(UserRole.OWNER)` |
| Re-invite while pending | 409 (`EMAIL_ALREADY_INVITED`); lapsed invites replace silently | same — mirrors the existing UI, which has a Revoke action but no Resend |
| Revoke | `DELETE /v1/admin/settings/invites/:inviteId` | `DELETE /v1/settings/members/:memberId` |

**Reusing `password_reset_tokens` instead of a new table** is the one structural departure from the
admin pattern, and it's not an invention — the schema was already built for it.
`TokenPurpose.INVITE` exists in the enum with a doc comment calling out "a future invite... flow,
not yet built," and `0007_auth_hardening.sql` already shaped this table around multiple purposes
sharing one row per `(user_id, purpose)` (the unique index is on that pair, not on `token_hash`,
specifically so `VERIFY_EMAIL`/`SET_PASSWORD`/now `INVITE` can coexist). The one wrinkle: that
table's `token_hash` index is non-unique because two different users can land on the same 6-digit
OTP — irrelevant here (a 256-bit invite token colliding is not a real possibility) but harmless,
since nothing about this feature needs the uniqueness that index doesn't provide.

**Route names already anticipate this.** `RouteNames.INVITE_VALIDATE` / `INVITE_ACCEPT` /
`INVITE_GOOGLE` (`'invite/:token'` / `'invite/accept'` / `'invite/:token/google'`) are *not*
`ADMIN_`-prefixed, unlike their roster-management siblings (`ADMIN_SETTINGS_INVITES`,
`ADMIN_SETTINGS_INVITE_BY_ID`). Composed under `RouteNames.AUTH` (`'auth'`) instead of
`RouteNames.ADMIN_AUTH`, they resolve to `/v1/auth/invite/*` — the exact tenant-side mirror of
`/v1/admin/auth/invite/*`, reusing the same three enum members rather than adding new ones.

## Backend plan

**Migration**: none for `users`/`password_reset_tokens` (both already shaped correctly).
`platform_settings.invite_members_enabled` already exists; this work adds its first real
consumer.

**New module surface**, following `apps/backend/docs/conventions/module-structure.md`'s
Controller → Service → DB Service → Repository layering, sibling to the existing settings module
(which already has this exact multi-controller shape — `blocklist-terms.controller.ts` +
`tenant-settings.controller.ts` under one `settings.module.ts`):

```
src/api/settings/
  controllers/
    tenant-members.controller.ts       # owner-authenticated: list, invite, revoke
  services/
    tenant-members.service.ts
  dto/
    invite-member.dto.ts               # { email }
    tenant-member-response.dto.ts      # { id, name, email, role, status, invitedAt }
  swagger/
    tenant-members.swagger.ts

src/api/auth/                          # accept-invite is auth-domain, same as admin's
  auth.controller.ts                   # gains: GET .../invite/:token, POST .../invite/accept,
                                        # GET .../invite/:token/google
  dto/
    accept-member-invite.dto.ts        # { token, name, password }
  enums/
    oauth-intent.enum.ts               # gains: INVITE
  services/
    auth.service.ts                    # gains: validateMemberInvite, acceptMemberInvite,
                                        # buildMemberInviteGoogleRedirect, completeMemberInviteGoogle;
                                        # handleGoogleCallback dispatches OAuthIntent.INVITE
```

Data access extends the **existing** `AuthRepository`/`AuthDbService`
(`src/db/repositories/auth/`) rather than a new repository domain — this is the same `users` +
`password_reset_tokens` tables that domain already owns exclusively; no other module reads them.
New methods, mirroring `platform-admin.repository.ts`'s invite methods:

- `insertInvitedMember(tx, { tenantId, email, invitedByUserId })` → inserts `users` row,
  `status = 'invited'`, `role = 'member'`, `password_hash = NULL`.
- `findInviteEmailByTokenHash(tokenHash)` → read-only preview, same shape as the admin
  equivalent.
- `acceptMemberInviteWithPassword(tx, { tokenHash, name, passwordHash })` → the compare-and-swap:
  `used_at IS NULL AND expires_at > now()` inside the same `UPDATE` that consumes the token,
  flips `users.status` to `active`, sets `name`/`password_hash`, all in one transaction — same
  shape as `AuthRepository.consumeVerifyEmailToken` + `activateUser` combined.
- `findLiveInviteForEmail(tenantId, email)` / revoke — for the 409-on-live-invite and
  `DELETE .../members/:id` paths.

**Messages**: `AUTH.INVALID_OR_EXPIRED_INVITE` / `AUTH.INVITE_ACCEPTED` already exist and are
generic enough to reuse verbatim for this flow (not admin-specific in name or wording). New:
`SETTINGS.MEMBER_INVITE_SENT`, `SETTINGS.MEMBER_EMAIL_ALREADY_INVITED`,
`SETTINGS.MEMBER_NOT_FOUND`, `SETTINGS.MEMBER_INVITE_REVOKED` (mirroring `ADMIN.INVITE_SENT` /
`EMAIL_ALREADY_INVITED` / etc.), en + de.

**Email**: new `IMemberInviteEmailJob` (mirrors `IAdminInviteEmailJob`: `{ inviteLink, expiresIn }`
extending `IEmailJob`), new `JobName.MEMBER_INVITE_EMAIL`, new `member-invite.hbs` template — can
likely be the same template as `admin-invite.hbs` with copy changes ("join `{tenantName}` on
InnoPeak" instead of "join InnoPeak as a platform admin"), since the tenant name should appear
somewhere the admin one has no equivalent for.

**Frontend**: replace `TenantMemberService`'s mock body with real SDK calls
(`GET/POST/DELETE /v1/settings/members`) once the SDK is regenerated — the hook
(`useTenantMembers`) and every consuming component stay as-is, since the mock already returns the
`TenantMember` shape the real DTO will match. New: an accept-invite page and view (own route, own
component names — `/invite/[token]` and `AcceptInviteView` already belong to the admin flow), plus
its own hook mirroring `useAcceptAdminInvite`, with the added name field per Decision 1.

## Decisions

1. **The accept screen collects a name.** `AcceptMemberInviteDto = { token, name, password }`. The
   invite-send form (`MembersSettingsSection`) stays email-only, as already built — no
   `InviteMemberDto.name` field. `users.name` is populated at accept time, same moment
   `password_hash` is, inside the same compare-and-swap `UPDATE`.
2. **Token storage reuses `password_reset_tokens`, `purpose = 'invite'`.** No new table. See "The
   pattern being mirrored" above for why the schema was already shaped this way —
   `TokenPurpose.INVITE`, `hashToken`'s own doc comment, and the `(user_id, purpose)` unique index
   all predate this branch and anticipate exactly this reuse.
3. **Re-invite mirrors admin: 409 while a live invite is pending, revoke first to re-invite.**
   `SETTINGS.MEMBER_EMAIL_ALREADY_INVITED` on a second `POST .../members` for the same email while
   its invite row is unused and unexpired. A lapsed invite (past `expires_at`) replaces silently,
   same as admin's `sendInvite`. No separate "resend" endpoint — matches the mocked UI, which has
   Revoke and no Resend.
4. **Google SSO ships in this branch, alongside password accept.** A new `OAuthIntent.INVITE`
   (tenant-member accept — distinct from `OAuthIntent.ADMIN_INVITE`, which stays admin-only),
   composing into the shared `GET /v1/auth/google/callback` the same way the admin one does:
   `AuthService` resolves the intent, validates the invite token, checks the IdP-verified email
   against the invited address (`INVITE_EMAIL_MISMATCH` on mismatch, token left unconsumed), links
   a `user_identities` row, and signs the member in. `GET /v1/auth/invite/:token/google` is the new
   route (`RouteNames.INVITE_GOOGLE`, reused). Unlike the admin case, no
   lockout guard is needed on `updatePlatformSettings` (admins no longer have one either) — a
   Google-accepted tenant member still has `set-password/request-otp` + `set-password` available
   to add a password afterward (the tenant flow, unlike the admin one, already has this), so
   turning `googleLoginEnabled` off later never permanently strands them the way it would an
   admin.
5. **Accept-invite routes live directly on `AuthController`/`AuthService`.** No new sibling
   controller — `validateMemberInvite`, `acceptMemberInvite`, `inviteGoogleAuthorize` (or a
   distinctly-named method if `AuthController` already has a Google-authorize method for
   login/signup intents — check for a naming collision when wiring the route) join the existing
   controller. The "split it out" argument that produced `PlatformAdminAuthController` was about
   an entirely separate cookie namespace and login route; neither applies here.

**Confirmed as assumed:** invited members are always `role = 'member'` (no role selector on the
invite form, no co-owner invites via this flow). Revoke only ever targets a pending invite
(`status = 'invited'`) — deactivating an already-active member is a different, unbuilt feature and
stays out of scope.
