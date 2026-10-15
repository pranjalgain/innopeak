import type { Locale } from '@common/i18n/locale';

import type { SsoAuthFailure, SsoProvider } from '../constants/sso-auth.constants';
import type { PlatformAdminTokenResponseDto } from '../dto/platform-admin-token-response.dto';
import type { TokenResponseDto } from '../dto/token-response.dto';
import type { JwtTokenType } from '../enums/jwt-token-type.enum';
import type { OAuthIntent } from '../enums/oauth-intent.enum';
import type { UserRole } from '../enums/user-role.enum';

export interface TenantAuthUser {
  type: JwtTokenType.TENANT_USER;
  id: string;
  tenantId: string;
  email: string;
  role: UserRole;
  /** From the access token's `locale` claim; null = never chose one. Stale until the token is refreshed. */
  locale: Locale | null;
}

export interface PlatformAdminAuthUser {
  type: JwtTokenType.PLATFORM_ADMIN;
  id: string;
  email: string;
  /** From the access token's `locale` claim; null = never chose one. Stale until the token is refreshed. */
  locale: Locale | null;
  /**
   * The presenting token's `exp` (epoch seconds). A re-signed platform-admin token must expire at
   * the same instant: admins have no refresh token so a leaked access token dies within 15 minutes,
   * and a fresh-TTL re-sign would let a looping caller keep a stolen session alive indefinitely.
   * A token lacking `exp` falls back to the full TTL.
   */
  sessionExpiresAt?: number;
}

/**
 * Narrow on `type` before trusting `tenantId` or `role` — a platform-admin token has neither, and
 * treating that as absent-but-fine on a tenant-scoped query is a cross-tenant data leak.
 */
export type AuthUser = PlatformAdminAuthUser | TenantAuthUser;

export interface TenantJwtPayload {
  sub: string; // users.id
  tenantId: string;
  email: string;
  role: UserRole;
  /** `users.locale` when signed; null = never chose. Stale until refresh, like `role`/`tenantId`. */
  locale: Locale | null;
  type: JwtTokenType.TENANT_USER;
  iat?: number;
  exp?: number;
}

export interface PlatformAdminJwtPayload {
  sub: string; // platform_admins.id
  email: string;
  /** `platform_admins.locale` when signed; null = never chose. Stale until refresh. */
  locale: Locale | null;
  type: JwtTokenType.PLATFORM_ADMIN;
  iat?: number;
  exp?: number;
}

/**
 * Signed with JWT_REFRESH_SECRET so it can't pass `JwtStrategy` on signature alone; the `type`
 * claim is the second line of defence when the two secrets are equal (local-dev fallback).
 */
export interface RefreshJwtPayload {
  sub: string; // users.id
  jti: string;
  type: JwtTokenType.REFRESH;
  iat?: number;
  exp?: number;
}

export type JwtPayload = PlatformAdminJwtPayload | TenantJwtPayload;

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
  /** Embedded in the access token so locale resolution needs no per-request DB lookup. Null = never chose. */
  locale: Locale | null;
}

export interface PlatformAdminTokenSubject {
  id: string;
  email: string;
  /** Embedded in the access token so locale resolution needs no per-request DB lookup. Null = never chose. */
  locale: Locale | null;
}

export interface SpentTokenInput {
  revokedAt: string;
  userId: string;
}

/** Kept separate from persisting so `rotate` can commit the insert atomically with the revoke. */
export interface SignedTokenPair {
  tokens: TokenResponse;
  refreshTokenHash: string;
  refreshExpiresAt: string;
}

/** The refresh token is kept out of the body so the controller can set it as an httpOnly cookie, unreadable by page scripts. */
export interface TokenIssuanceResult {
  body: TokenResponseDto;
  refreshToken: string;
}

/**
 * No `refreshToken` (platform admins have none). Must stay structurally distinct from
 * `TokenIssuanceResult` and `LoginPendingVerificationDto`: the Google callback tells them apart
 * with a plain `in`/`kind` check.
 */
export interface PlatformAdminLoginResult {
  admin: true;
  body: PlatformAdminTokenResponseDto;
}

export interface SsoIdentity {
  /** Google's stable `sub`. The identity key, deliberately not the email, which can be reassigned within a Workspace domain. */
  providerUserId: string;
  email: string;
  /** Google's own claim; false is refused rather than trusted. */
  emailVerified: boolean;
  /** Absent on some accounts; the caller falls back to the email. */
  name: string | null;
  /** Microsoft only: the Entra directory (`tid`) that signed the user in. Admin sign-in requires it to be the pinned one. */
  tenantId?: string;
}

export interface GoogleAuthorizeRequest {
  state: string;
}

export interface GoogleCallbackRequest {
  code: string;
}

/** Failure is a redirect, not an exception: the browser navigated here directly, so a JSON error body would render as a document. */
export type SsoAuthorizeRedirect =
  { ok: false; redirectUrl: string } | { ok: true; authorizationUrl: string; sid: string };

export interface SsoAuthorizeInput {
  intent: OAuthIntent;
}

export interface SsoCallbackInput {
  code: string | undefined;
  state: string | undefined;
  error: string | undefined;
  sid: string | undefined;
}

export type SsoCallbackOutcome =
  /** `redirectUrl` is already the full `<page>?error=<failure>&provider=<provider>` target. */
  | { ok: false; failure: SsoAuthFailure; redirectUrl: string }
  /** `ADMIN_INVITE` completed, or an admin signed in through the admin sign-in page (`ADMIN_LOGIN`, Google or Microsoft). */
  | { ok: true; kind: 'admin_signed_in'; tokens: PlatformAdminLoginResult }
  /** A genuinely new person — the caller sets `pendingSignupCookie` and redirects to collect a business name. */
  | { ok: true; kind: 'needs_business_name'; pendingSignupCookie: string }
  | { ok: true; kind: 'signed_in'; tokens: TokenIssuanceResult };

/** Everything the callback's write path needs. Read from Redis, never from the client's blob. */
export interface OAuthStateRecord {
  provider: SsoProvider;
  intent: OAuthIntent;
  /** The OIDC `nonce` sent to the provider; an ID token that does not echo it is refused. */
  nonce: string;
  /** PKCE verifier, for providers that use it. Server-side only: never in a URL or cookie. */
  codeVerifier?: string;
  /** SHA-256 of the browser-binding cookie value. The cookie itself is never stored. */
  sidHash: string;
  /** `ADMIN_INVITE` only — the invite being redeemed; kept server-side, never exposed beyond the opaque signed `state`. */
  inviteToken?: string;
}

export interface MintedOAuthState {
  /** Goes to the provider as the `state` query param. */
  state: string;
  /** Goes to the browser as the provider's `*_auth_sid` cookie. */
  sid: string;
  /** Goes to the provider as the OIDC `nonce`. */
  nonce: string;
  /** S256 PKCE challenge, present only when `pkce` was requested. */
  codeChallenge?: string;
}

export type ConsumeOAuthStateResult = { ok: false } | { ok: true; record: OAuthStateRecord };

/** A Google-verified identity with no tenant yet. */
export interface PendingSsoSignupIdentity {
  /** Which provider verified it, so the business-name step links the right identity. */
  provider: SsoProvider;
  providerUserId: string;
  email: string;
  name: string | null;
}

export type ConsumePendingSsoSignupResult =
  { ok: false } | { ok: true; identity: PendingSsoSignupIdentity };

/** Lets the login/signup callback detect a *returning* admin before consulting tenant tables. Not used for `ADMIN_INVITE`, which is always a first-time link. */
export type LinkedAdminLookup =
  | { linked: false }
  | { linked: true; active: false }
  | { linked: true; active: true; tokens: PlatformAdminLoginResult };

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
