import { MESSAGES } from '@common/constants/messages.constants';
import type { Locale } from '@common/i18n/locale';
import { EnvConfig } from '@config/env.config';
import { AuthDbService, type TenantRow } from '@db/repositories/auth/auth.db-service';
import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';

import { randomBytes } from 'crypto';

import {
  ACCESS_TOKEN_TTL_SECONDS,
  JWT_SIGNING_ALGORITHM,
  REFRESH_REUSE_GRACE_SECONDS,
  REFRESH_TOKEN_BYTES,
  REFRESH_TOKEN_TTL_SECONDS,
} from '../constants/auth.constants';
import { JwtTokenType } from '../enums/jwt-token-type.enum';
import { TenantStatus } from '../enums/tenant-status.enum';
import { UserRole } from '../enums/user-role.enum';
import { UserStatus } from '../enums/user-status.enum';
import { RefreshTokenSupersededException } from '../errors/refresh-token.error';
import {
  PlatformAdminJwtPayload,
  RefreshJwtPayload,
  TenantJwtPayload,
} from '../types/jwt-payload.type';
import { TokenResponse } from '../types/token-response.type';
import { hashToken } from '../utils/token.utils';

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

interface SpentTokenInput {
  revokedAt: string;
  userId: string;
}

/** A signed pair plus what `refresh_tokens` needs to record it — separated from persisting so `rotate` can commit the insert atomically with the revoke. */
interface SignedTokenPair {
  tokens: TokenResponse;
  refreshTokenHash: string;
  refreshExpiresAt: string;
}

/**
 * Owns issuing/rotating/revoking the access+refresh token pair — the one thing every success
 * path in this module (signup's verify-email step, login, refresh) needs, so it's a shared
 * service rather than duplicated logic in `AuthService`. "Basic rotation" only (see
 * `refresh_tokens` migration comment): single-use rotation and revocation, not the fuller
 * reuse-grace-window replay tolerance / token-family theft detection the docs describe as a
 * follow-up.
 *
 * The refresh token is itself a signed JWT (bound to JWT_REFRESH_SECRET, distinct from the
 * access token's JWT_SECRET) purely so a garbage/expired token can be rejected cheaply before
 * ever touching the DB — the actual source of truth for validity/revocation is always the
 * `refresh_tokens` row, looked up by `sha256(token)`. A `jti` claim guarantees two tokens issued
 * for the same user in the same second are never byte-identical (they'd otherwise collide on
 * `refresh_tokens.token_hash`'s unique index). Depends on `AuthDbService`, not `AuthRepository`
 * directly — same layering rule every Service in this module follows.
 */
@Injectable()
export class TokenService {
  private readonly logger = new Logger(TokenService.name);

  constructor(
    private readonly jwtService: JwtService,
    private readonly authDbService: AuthDbService,
    private readonly configService: ConfigService<EnvConfig>
  ) {}

  async issueTokenPair(user: TokenSubject): Promise<TokenResponse> {
    const signed = this.signTokenPair(user);
    await this.authDbService.insertRefreshToken({
      userId: user.id,
      tokenHash: signed.refreshTokenHash,
      expiresAt: signed.refreshExpiresAt,
    });

    return signed.tokens;
  }

  /**
   * Verifies the JWT, then re-checks the principal's standing before honoring it (a valid
   * refresh token only proves the caller *had* a session, not that they still should) — a
   * disabled user or suspended tenant gets every one of their refresh tokens revoked, the
   * closest "basic rotation" gets to the docs' token-family revocation.
   *
   * The revoke of the spent token and the insert of its replacement are one atomic DB step
   * (`AuthDbService.rotateRefreshToken`), and a revoke that changed nothing means someone else
   * already spent this token — that caller is rejected, not handed a second live session.
   *
   * Two ways to fail to find an active token, and they are NOT interchangeable to the caller:
   * the session may be genuinely gone (revoked on logout, expired, or the row deleted by a dev
   * DB reset), or the token may simply have lost a race to a concurrent refresh that already
   * minted a valid successor. Both are a 401 with the same message, but only the first should
   * clear the browser's session cookies — see `RefreshTokenSupersededException` and
   * `AuthController.refresh`. `hasActiveRefreshToken` is what tells the two apart.
   */
  async rotate(rawRefreshToken: string): Promise<{
    tokens: TokenResponse;
    user: TokenSubject & { name: string; passwordHash: string | null };
    /** Handed back so `AuthService.refresh` doesn't re-query the row this method already read. */
    tenant: TenantRow | null;
  }> {
    const payload = this.verifyRefreshToken(rawRefreshToken);

    const existing = await this.authDbService.findRefreshTokenByHash(hashToken(rawRefreshToken));
    if (existing?.userId !== payload.sub) {
      // No row at all: revoked-and-purged, expired, or a DB reset took it. Nothing to infer, and
      // the session is genuinely gone. The JWT's signature already verified, so `payload.sub` is
      // trustworthy enough to ask whether this user still holds a live session somewhere.
      throw (await this.authDbService.hasActiveRefreshToken(payload.sub))
        ? new RefreshTokenSupersededException()
        : new UnauthorizedException(MESSAGES.AUTH.INVALID_REFRESH_TOKEN);
    }

    if (existing.revokedAt !== null) {
      await this.handleSpentToken({ revokedAt: existing.revokedAt, userId: payload.sub });
    }

    const stored = existing;

    const user = await this.authDbService.findUserById(stored.userId);
    if (!user) {
      throw new UnauthorizedException(MESSAGES.AUTH.INVALID_REFRESH_TOKEN);
    }

    const tenant = await this.authDbService.findTenantStatus(user.tenantId);
    if (user.status === UserStatus.DISABLED || tenant?.status === TenantStatus.SUSPENDED) {
      await this.revokeAll(user.id);
      throw new UnauthorizedException(MESSAGES.AUTH.INVALID_REFRESH_TOKEN);
    }

    const subject: TokenSubject = {
      id: user.id,
      tenantId: user.tenantId,
      email: user.email,
      role: user.role,
      locale: user.locale,
    };
    const signed = this.signTokenPair(subject);
    const rotated = await this.authDbService.rotateRefreshToken(stored.id, {
      userId: user.id,
      tokenHash: signed.refreshTokenHash,
      expiresAt: signed.refreshExpiresAt,
    });
    if (!rotated) {
      // The row was active when we read it and isn't now: a concurrent refresh spent it between
      // the read and this compare-and-swap, and that winner's successor is live. Definitionally
      // a lost race, so never clear the caller's cookies over it.
      throw new RefreshTokenSupersededException();
    }

    return {
      tokens: signed.tokens,
      user: { ...subject, name: user.name, passwordHash: user.passwordHash },
      tenant,
    };
  }

  /**
   * A refresh token was presented that had already been spent. Always throws.
   *
   * Two very different situations reach here, told apart by *how long ago* the token was revoked:
   *
   * - **Within the grace window** — a lost rotation race. Two tabs waking from the same idle
   *   period both refresh; the loser presents a token the winner revoked milliseconds ago, whose
   *   successor is already in the shared cookie jar. Benign, and clearing the session over it
   *   would sign the user out of every tab (`RefreshTokenSupersededException` keeps cookies).
   *
   * - **Older than that** — reuse of a spent token. The legitimate holder moved on to the
   *   successor long ago, so a still-circulating copy most likely leaked. The whole family is
   *   revoked: the thief and the victim both lose their sessions, and only the victim can sign in
   *   again with credentials. Losing a session is the cheap outcome; leaving a thief holding a
   *   self-renewing 7-day chain is not.
   *
   * Note the daily `purgeStaleTokens` cron eventually deletes revoked rows too — not immediately
   * on revocation, but only once a row has been revoked for at least
   * `REFRESH_TOKEN_REVOKED_RETENTION_HOURS`, so this detection window is a consistent floor rather
   * than however long happened to remain until the cron's next fixed run. A replay older than that
   * floor finds no row and lands in the "session gone" branch above instead — the same 401, just
   * without the family revoke.
   */
  private async handleSpentToken(input: SpentTokenInput): Promise<never> {
    const { revokedAt, userId } = input;
    const revokedAgeMs = Date.now() - new Date(revokedAt).getTime();

    if (revokedAgeMs <= REFRESH_REUSE_GRACE_SECONDS * 1000) {
      throw new RefreshTokenSupersededException();
    }

    this.logger.warn(
      `Refresh token reuse detected for user ${userId} (spent ${Math.round(revokedAgeMs / 1000)}s ago); revoking all sessions.`
    );
    await this.revokeAll(userId);
    throw new UnauthorizedException(MESSAGES.AUTH.INVALID_REFRESH_TOKEN);
  }

  async revokeAll(userId: string): Promise<void> {
    await this.authDbService.revokeAllRefreshTokensForUser(userId);
  }

  /**
   * Logout path: revoke every session belonging to whoever this refresh token was issued to.
   * Only the signature is required, not a live `refresh_tokens` row — an already-rotated or
   * expired token still proves (cryptographically) which user it was minted for, and on logout
   * the right response to "this token is spent" is still to clear out that user's other sessions
   * rather than to do nothing. A token we didn't sign is ignored silently: logout is idempotent
   * and must not become an oracle for which tokens are valid.
   */
  async revokeBySessionToken(rawRefreshToken: string): Promise<void> {
    let payload: RefreshJwtPayload;
    try {
      // `ignoreExpiration` so the comment above holds literally: an *expired* refresh token still
      // proves cryptographically which user it was minted for, and on logout the right response to
      // "this token is past its TTL" is still to clear that user's other sessions rather than to
      // do nothing. Signature and the `type` claim are still enforced.
      payload = this.verifyRefreshToken(rawRefreshToken, { ignoreExpiration: true });
    } catch {
      return;
    }

    await this.revokeAll(payload.sub);
  }

  /** Just the access token — shared by `signTokenPair` and `reissueAccessToken`, the latter never touching `refresh_tokens` at all. */
  private signAccessToken(user: TokenSubject): string {
    const accessPayload: TenantJwtPayload = {
      sub: user.id,
      tenantId: user.tenantId,
      email: user.email,
      role: user.role,
      locale: user.locale,
      type: JwtTokenType.TENANT_USER,
    };
    return this.jwtService.sign(accessPayload);
  }

  /**
   * Re-signs the access token alone, with no refresh token and no `refresh_tokens` write — for a
   * claim update (today: `locale`) that must be visible on the caller's *current* token without
   * minting a new 7-day session from a bare access token. `issueTokenPair`/`signTokenPair` always
   * mint a refresh token together with the access token because every one of their callers
   * (login, verify-email, refresh, the Google callback) is already establishing or rotating a real
   * session; this method is for the narrower case of refreshing a claim mid-session. Reusing
   * `issueTokenPair` here would let anyone holding only a leaked access token (which travels in
   * the JSON body for `Bearer` clients, unlike the httpOnly refresh cookie) call this route to
   * mint themselves a fresh, indefinitely-rotatable 7-day refresh token — turning a credential
   * whose worst case was a 15-minute window into one worth 7+ days, with no proof beyond what an
   * XSS or a stray log line could already have exposed.
   */
  reissueAccessToken(user: TokenSubject): { accessToken: string; expiresIn: number } {
    return { accessToken: this.signAccessToken(user), expiresIn: ACCESS_TOKEN_TTL_SECONDS };
  }

  /**
   * Access-token only, same as `reissueAccessToken` and for the same reason — no `refresh_tokens`
   * row exists for this principal type at all yet (that table's `user_id` FKs to `users`, not
   * `platform_admins`), so there is nothing to rotate. A platform admin simply re-authenticates
   * with `login` once this token's 15-minute TTL lapses. Worth revisiting if admin sessions turn
   * out to need to outlive that without repeated logins.
   *
   * `expiresInSeconds` exists for the one caller that re-signs an *already authenticated* admin's
   * token to refresh a claim mid-session (`AdminSettingsService.updateLocale`). It must pass the
   * lifetime remaining on the presenting token, so the replacement dies at the same moment the
   * original would have. Defaulting it to the full TTL instead would quietly turn that route into
   * a session-extension primitive — the one thing the "admins hold no refresh token" design is
   * meant to prevent. Sign-in paths omit it: they are establishing a session, not continuing one.
   */
  signPlatformAdminAccessToken(
    admin: PlatformAdminTokenSubject,
    expiresInSeconds: number = ACCESS_TOKEN_TTL_SECONDS
  ): {
    accessToken: string;
    expiresIn: number;
  } {
    const payload: PlatformAdminJwtPayload = {
      sub: admin.id,
      email: admin.email,
      locale: admin.locale,
      type: JwtTokenType.PLATFORM_ADMIN,
    };
    return {
      accessToken: this.jwtService.sign(payload, { expiresIn: expiresInSeconds }),
      expiresIn: expiresInSeconds,
    };
  }

  /** Pure signing, no I/O — `expiresIn` is the *access* token's lifetime (what the client schedules its refresh around), not the refresh token's. */
  private signTokenPair(user: TokenSubject): SignedTokenPair {
    const accessToken = this.signAccessToken(user);

    const refreshPayload: RefreshJwtPayload = {
      sub: user.id,
      jti: randomBytes(REFRESH_TOKEN_BYTES).toString('base64url'),
      type: JwtTokenType.REFRESH,
    };
    const refreshToken = this.jwtService.sign(refreshPayload, {
      secret: this.refreshSecret(),
      expiresIn: REFRESH_TOKEN_TTL_SECONDS,
    });

    return {
      tokens: { accessToken, refreshToken, expiresIn: ACCESS_TOKEN_TTL_SECONDS },
      refreshTokenHash: hashToken(refreshToken),
      refreshExpiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_SECONDS * 1000).toISOString(),
    };
  }

  /** Signature + expiry via the refresh secret, then the `type` claim — an access token (or anything else) signed with the same secret is not a refresh token. */
  private verifyRefreshToken(
    rawRefreshToken: string,
    options: { ignoreExpiration?: boolean } = {}
  ): RefreshJwtPayload {
    let payload: Partial<RefreshJwtPayload>;
    try {
      payload = this.jwtService.verify<Partial<RefreshJwtPayload>>(rawRefreshToken, {
        secret: this.refreshSecret(),
        // Pinned so a token cannot dictate how it is verified. `jsonwebtoken` already refuses an
        // asymmetric alg against a string secret, so this is defence in depth rather than a live
        // hole — but the pin is what keeps it that way if the secret ever becomes a key object.
        algorithms: [JWT_SIGNING_ALGORITHM],
        ...(options.ignoreExpiration === true ? { ignoreExpiration: true } : {}),
      });
    } catch {
      throw new UnauthorizedException(MESSAGES.AUTH.INVALID_REFRESH_TOKEN);
    }

    if (
      payload.type !== JwtTokenType.REFRESH ||
      typeof payload.sub !== 'string' ||
      typeof payload.jti !== 'string'
    ) {
      throw new UnauthorizedException(MESSAGES.AUTH.INVALID_REFRESH_TOKEN);
    }

    return { ...payload, sub: payload.sub, jti: payload.jti, type: JwtTokenType.REFRESH };
  }

  private refreshSecret(): string {
    return (
      this.configService.get<string>('JWT_REFRESH_SECRET') ??
      this.configService.get<string>('JWT_SECRET') ??
      ''
    );
  }
}
