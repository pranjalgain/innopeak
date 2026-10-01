import type { Locale } from '@common/i18n/locale';

import type { GoogleAuthFailure } from '../constants/google-auth.constants';
import type { PlatformAdminTokenResponseDto } from '../dto/platform-admin-token-response.dto';
import type { TokenResponseDto } from '../dto/token-response.dto';
import type { JwtTokenType } from '../enums/jwt-token-type.enum';
import type { OAuthIntent } from '../enums/oauth-intent.enum';
import type { UserRole } from '../enums/user-role.enum';

// ─── Auth user (session identity) ────────────────────────────────────────────

export interface TenantAuthUser {
  type: JwtTokenType.TENANT_USER;
  id: string;
  tenantId: string;
  email: string;
  role: UserRole;
  /** From the access token's `locale` claim — null if the user never chose one, stale until the
   * token is refreshed. See `resolveLocale`'s call sites for how this is used. */
  locale: Locale | null;
}

export interface PlatformAdminAuthUser {
  type: JwtTokenType.PLATFORM_ADMIN;
  id: string;
  email: string;
  /** From the access token's `locale` claim — null if the admin never chose one, stale until the
   * token is refreshed. Same shape as `TenantAuthUser.locale`. */
  locale: Locale | null;
  /**
   * The presenting token's `exp` claim, in seconds since the epoch. Only routes that re-sign a
   * platform-admin token mid-session need it, so that the replacement expires at the *same*
   * instant as the token that authorized the call. Without that, any route handing back a freshly
   * signed token would double as a session-extension primitive: a platform admin has no refresh
   * token precisely so that a leaked access token dies within its 15 minutes, and a caller looping
   * such a route just under the TTL would keep the stolen session alive indefinitely.
   *
   * Optional because it is session metadata rather than identity — a caller that does not re-sign
   * has no business reading it, and a token somehow lacking `exp` simply falls back to the full
   * TTL at the one call site that cares.
   */
  sessionExpiresAt?: number;
}

/**
 * A guard/repository must narrow on `type` before trusting `tenantId` or `role` — a
 * platform-admin token has neither, and treating them as absent-but-fine on a tenant-scoped
 * query is a cross-tenant data leak, not a type error. See the auth API reference's Session /
 * token model section.
 */
export type AuthUser = PlatformAdminAuthUser | TenantAuthUser;

// ─── JWT payloads ─────────────────────────────────────────────────────────────

export interface TenantJwtPayload {
  sub: string; // users.id
  tenantId: string;
  email: string;
  role: UserRole;
  /** `users.locale` at the time this token was signed — null means the user never chose one.
   * Stale until the token is refreshed, same as `role`/`tenantId`. */
  locale: Locale | null;
  type: JwtTokenType.TENANT_USER;
  iat?: number;
  exp?: number;
}

export interface PlatformAdminJwtPayload {
  sub: string; // platform_admins.id
  email: string;
  /** `platform_admins.locale` at the time this token was signed — null means the admin never
   * chose one. Stale until the token is refreshed, same as the tenant claim above. */
  locale: Locale | null;
  type: JwtTokenType.PLATFORM_ADMIN;
  iat?: number;
  exp?: number;
}

/**
 * Signed with JWT_REFRESH_SECRET, never JWT_SECRET, so it can't pass `JwtStrategy` on signature
 * alone; the `type` claim is the second, independent line — even with the two secrets equal
 * (the local-dev fallback), a refresh token presented as a bearer token is rejected.
 */
export interface RefreshJwtPayload {
  sub: string; // users.id
  jti: string;
  type: JwtTokenType.REFRESH;
  iat?: number;
  exp?: number;
}

/** What `JwtStrategy.validate` may receive — the access-token shapes it accepts, or anything else it must refuse. */
export type JwtPayload = PlatformAdminJwtPayload | TenantJwtPayload;

// ─── Token issuance ───────────────────────────────────────────────────────────

export interface TokenResponse {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface TokenSubject {
  id: string;
  tenantId: string;
  email: string;
  role: UserRole;
  /** Embedded in the access token so locale resolution never needs a per-request DB lookup — see
   * `resolveLocale`'s call sites. Null means "never chose", same as the `users.locale` column. */
  locale: Locale | null;
}

export interface PlatformAdminTokenSubject {
  id: string;
  email: string;
  /** Same reasoning as `TokenSubject.locale` — embedded so locale resolution never needs a
   * per-request DB lookup. Null means "never chose", same as `platform_admins.locale`. */
  locale: Locale | null;
}

export interface SpentTokenInput {
  revokedAt: string;
  userId: string;
}

/** A signed pair plus what `refresh_tokens` needs to record it — separated from persisting so `rotate` can commit the insert atomically with the revoke. */
export interface SignedTokenPair {
  tokens: TokenResponse;
  refreshTokenHash: string;
  refreshExpiresAt: string;
}

export interface TokenIssuanceResult {
  body: TokenResponseDto;
  refreshToken: string;
}

/**
 * Structurally distinct from `TokenIssuanceResult` (`AuthService`'s own tenant equivalent — no
 * `refreshToken` field, since a platform admin has none — see `TokenService.signPlatformAdminAccessToken`)
 * and `LoginPendingVerificationDto` (no `body`/`admin` field). `AuthController`'s Google callback
 * still needs to tell all of these apart with a plain `in`/`kind` check, which is why this shape
 * hasn't changed even though it now lives on its own service.
 */
export interface PlatformAdminLoginResult {
  admin: true;
  body: PlatformAdminTokenResponseDto;
}

// ─── Google identity & OAuth ──────────────────────────────────────────────────

/** The normalized profile the callback works with, whatever provider implementation produced it. */
export interface GoogleIdentity {
  /**
   * Google's stable subject id. The identity key, deliberately not the email — an email can be
   * reassigned within a Workspace domain, `sub` never is, which is why
   * `idx_user_identities_provider_provider_user_id` is unique on `(provider, provider_user_id)`.
   */
  providerUserId: string;
  email: string;
  /** Google's own claim. A false value is refused rather than trusted — see the callback. */
  emailVerified: boolean;
  /** The person's display name. Absent on some accounts, so the caller falls back to the email. */
  name: string | null;
}

export interface GoogleAuthorizeRequest {
  state: string;
}

export interface GoogleCallbackRequest {
  code: string;
}

/**
 * What starting a Google OAuth round trip produces — shared by `AuthService.buildGoogleAuthorizeRedirect`
 * (tenant login/signup) and `PlatformAdminAuthService.buildAdminInviteGoogleRedirect` (admin
 * invite acceptance), so both controllers redirect either way with the same shape rather than
 * throwing for an expected failure — the browser navigated here directly, so an exception
 * filter's JSON body would paint as a document.
 */
export type GoogleAuthorizeRedirect =
  { ok: false; redirectUrl: string } | { ok: true; authorizationUrl: string; sid: string };

export interface GoogleAuthorizeInput {
  intent: OAuthIntent;
}

/**
 * What a successful verify-email/login/refresh actually produces: the JSON body (no refresh
 * token in it) plus the raw refresh token separately, so `AuthController` can set it as an
 * httpOnly cookie instead of serializing it into the response — a script on the page should
 * never be able to read it.
 */
export type GoogleCallbackOutcome =
  /** `redirectUrl` is already the full `<page>?error=<failure>` target — computed here, from
   *  `intent`, rather than by `AuthController.googleCallback`. */
  | { ok: false; failure: GoogleAuthFailure; redirectUrl: string }
  /** `OAuthIntent.ADMIN_INVITE` completed, or a returning Google-linked admin signed back in on
   *  an ordinary login/signup round trip — see `PlatformAdminAuthService.completeAdminInviteGoogle`
   *  / `findLinkedAdmin`. */
  | { ok: true; kind: 'admin_signed_in'; tokens: PlatformAdminLoginResult }
  /** A genuinely new person — the caller sets `pendingSignupCookie` and redirects to collect a business name. */
  | { ok: true; kind: 'needs_business_name'; pendingSignupCookie: string }
  | { ok: true; kind: 'signed_in'; tokens: TokenIssuanceResult };

/** Everything the callback's write path needs. Read from Redis, never from the client's blob. */
export interface GoogleAuthStateRecord {
  intent: OAuthIntent;
  /** SHA-256 of the browser-binding cookie value. The cookie itself is never stored. */
  sidHash: string;
  /** `OAuthIntent.ADMIN_INVITE` only — which `platform_admin_invites` row this round trip is
   *  redeeming. Carried server-side in Redis, never round-tripped through the client beyond the
   *  opaque signed `state`. */
  inviteToken?: string;
}

export interface MintedGoogleState {
  /** Goes to Google as the `state` query param. */
  state: string;
  /** Goes to the browser as the `google_auth_sid` cookie. */
  sid: string;
}

export type ConsumeGoogleStateResult = { ok: false } | { ok: true; record: GoogleAuthStateRecord };

/** A Google identity Google has verified, but that has no tenant yet — see `PendingGoogleSignupService`'s own doc comment. */
export interface PendingGoogleSignupIdentity {
  providerUserId: string;
  email: string;
  name: string | null;
}

export type ConsumePendingGoogleSignupResult =
  { ok: false } | { ok: true; identity: PendingGoogleSignupIdentity };

/**
 * The outcome of resolving a Google identity against `platform_admin_identities` — used only by
 * the shared Google callback's login/signup branches (`AuthService.handleGoogleCallback`), to
 * decide whether this round trip belongs to a *returning* admin before it ever consults the
 * tenant tables. Not used by the `ADMIN_INVITE` intent, which is always a first-time link and
 * goes through `completeAdminInviteGoogle` instead.
 */
export type LinkedAdminLookup =
  | { linked: false }
  | { linked: true; active: false }
  | { linked: true; active: true; tokens: PlatformAdminLoginResult };

// ─── OTP / signup helpers ─────────────────────────────────────────────────────

export interface IssueOtpInput {
  userId: string;
  email: string;
  name: string;
}

export interface SendOtpEmailInput {
  email: string;
  customerName: string;
  rawOtp: string;
}
