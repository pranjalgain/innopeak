import { EnvConfig } from '@config/env.config';
import { AuthDbService } from '@db/repositories/auth/auth.db-service';
import type { TenantRow } from '@db/repositories/auth/types/auth.type';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';

import { randomBytes } from 'crypto';

import { SessionRevocationService } from './session-revocation.service';

import {
  ACCESS_TOKEN_TTL_SECONDS,
  JWT_SIGNING_ALGORITHM,
  REFRESH_REUSE_GRACE_SECONDS,
  REFRESH_TOKEN_BYTES,
  REFRESH_TOKEN_TTL_SECONDS,
} from '../constants/auth.constants';
import { JwtTokenType } from '../enums/jwt-token-type.enum';
import { UserStatus } from '../enums/user-status.enum';
import { RefreshTokenSupersededException } from '../errors/refresh-token.error';
import { InvalidRefreshTokenException } from '../exceptions/auth.exceptions';
import type {
  PlatformAdminJwtPayload,
  PlatformAdminTokenSubject,
  RefreshJwtPayload,
  SignedTokenPair,
  SpentTokenInput,
  TenantJwtPayload,
  TokenResponse,
  TokenSubject,
} from '../types/auth.type';
import { isTenantLoginBlocked } from '../utils/tenant-status.util';
import { hashToken } from '../utils/token.utils';

/**
 * The refresh token is a signed JWT (separate secret) only so garbage or expired tokens are
 * rejected before touching the DB; the source of truth is the `refresh_tokens` row, looked up by
 * `sha256(token)`. A `jti` claim keeps two tokens issued for the same user in the same second from
 * colliding on `token_hash`'s unique index.
 */
@Injectable()
export class TokenService {
  private readonly logger = new Logger(TokenService.name);

  constructor(
    private readonly jwtService: JwtService,
    private readonly authDbService: AuthDbService,
    private readonly configService: ConfigService<EnvConfig>,
    private readonly sessionRevocationService: SessionRevocationService
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
   * Re-checks the principal's standing before honoring the token (a valid refresh token only proves
   * the caller had a session): a disabled user or suspended tenant gets every refresh token
   * revoked. Revoking the spent token and inserting its replacement is one atomic step; a revoke
   * that changed nothing means someone else already spent it, so the caller is rejected. Failing to
   * find an active token has two causes that are NOT interchangeable: the session is gone (clear
   * cookies), or the token lost a race to a concurrent refresh that minted a valid successor (keep
   * cookies). `hasActiveRefreshToken` tells them apart; see `RefreshTokenSupersededException`.
   */
  async rotate(rawRefreshToken: string): Promise<{
    tokens: TokenResponse;
    user: TokenSubject & { name: string; passwordHash: string | null };
    tenant: TenantRow | null;
  }> {
    const payload = this.verifyRefreshToken(rawRefreshToken);

    const existing = await this.authDbService.findRefreshTokenByHash(hashToken(rawRefreshToken));
    if (existing?.userId !== payload.sub) {
      // No row at all: revoked-and-purged, expired, or a DB reset took it, so the session is gone.
      // The signature already verified, so `payload.sub` is trustworthy enough to ask whether this
      // user holds a live session elsewhere.
      throw (await this.authDbService.hasActiveRefreshToken(payload.sub))
        ? new RefreshTokenSupersededException()
        : new InvalidRefreshTokenException();
    }

    if (existing.revokedAt !== null) {
      // Revoked by a sign-out or a password change, not rotated out: a dead session, not a replayed token. Treating it as reuse
      // would revoke the user's other, legitimate sessions, including the one a password change just minted.
      if (!existing.rotated) {
        throw new InvalidRefreshTokenException();
      }
      await this.handleSpentToken({ revokedAt: existing.revokedAt, userId: payload.sub });
    }

    const stored = existing;

    const user = await this.authDbService.findUserById(stored.userId);
    if (!user) {
      throw new InvalidRefreshTokenException();
    }

    const tenant = await this.authDbService.findTenantStatus(user.tenantId);
    if (user.status === UserStatus.DISABLED || isTenantLoginBlocked(tenant)) {
      await this.revokeAll(user.id);
      throw new InvalidRefreshTokenException();
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
      // Active when read, spent by a concurrent refresh before this compare-and-swap: a lost race,
      // so never clear the caller's cookies.
      throw new RefreshTokenSupersededException();
    }

    // A logout or password change racing this rotation revokes the old row only: its UPDATE does not see the successor this
    // transaction has just inserted. Every such event writes its mark before that UPDATE, so the mark exists by now, and the question is
    // the one an access token is asked: was the token being rotated minted before the session was ended? Judged on *that* token's `iat`,
    // not on the time of this rotation: a password change marks its own second and then hands the caller a fresh pair in that second, and
    // a refresh of that fresh pair (another tab, a moment later) must not be read as having raced the change.
    if (
      await this.sessionRevocationService.isRevoked({
        userId: user.id,
        tenantId: user.tenantId,
        issuedAt: payload.iat,
      })
    ) {
      await this.authDbService.revokeAllRefreshTokensForUser(user.id);
      throw new InvalidRefreshTokenException();
    }

    return {
      tokens: signed.tokens,
      user: { ...subject, name: user.name, passwordHash: user.passwordHash },
      tenant,
    };
  }

  /**
   * Always throws. Told apart by how long ago the token was revoked. Within the grace window it is
   * a lost rotation race (two tabs waking from idle): benign, and clearing the session would sign
   * the user out of every tab (`RefreshTokenSupersededException` keeps cookies). Older, it is reuse
   * of a spent token that likely leaked, so the whole family is revoked: thief and victim both lose
   * their sessions, and only the victim can sign back in. The daily `purgeStaleTokens` cron deletes
   * rows revoked for at least `REFRESH_TOKEN_REVOKED_RETENTION_HOURS`, so an older replay finds no
   * row and gets the same 401 without the family revoke.
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
    throw new InvalidRefreshTokenException();
  }

  /**
   * Ends every session: the refresh tokens in the database, and the access tokens already issued, which a JWT cannot otherwise take
   * back (see `SessionRevocationService`). Used by logout, refresh-token reuse and a refresh by a disabled user or suspended business.
   */
  async revokeAll(userId: string): Promise<void> {
    // The mark goes first: a refresh rotating at this moment re-checks it once its successor is committed (see `rotate`).
    await this.sessionRevocationService.revokeUser(userId);
    await this.authDbService.revokeAllRefreshTokensForUser(userId);
  }

  /**
   * Needs only the signature, not a live row: a spent or expired token still proves which user it
   * was minted for, and that user's other sessions should still be cleared. A token we didn't sign
   * is ignored silently so logout is not an oracle for valid tokens.
   */
  async revokeBySessionToken(rawRefreshToken: string): Promise<void> {
    let payload: RefreshJwtPayload;
    try {
      // `ignoreExpiration`: an expired token still identifies the user. Signature and the `type`
      // claim are still enforced.
      payload = this.verifyRefreshToken(rawRefreshToken, { ignoreExpiration: true });
    } catch {
      return;
    }

    await this.revokeAll(payload.sub);
  }

  /**
   * Logout for a session that has no usable refresh token: a platform admin never has one, and a tenant's refresh cookie may have
   * gone. The access token's signature proves who it was minted for; an expired one is already dead, and one we did not sign is
   * ignored silently (as in `revokeBySessionToken`) so logout is not an oracle for valid tokens.
   */
  async revokeByAccessToken(rawAccessToken: string): Promise<void> {
    let payload: { sub?: unknown; type?: unknown };
    try {
      payload = this.jwtService.verify<{ sub?: unknown; type?: unknown }>(rawAccessToken, {
        algorithms: [JWT_SIGNING_ALGORITHM],
      });
    } catch {
      return;
    }
    if (typeof payload.sub !== 'string') {
      return;
    }

    if (payload.type === JwtTokenType.PLATFORM_ADMIN) {
      await this.revokePlatformAdminSessions(payload.sub);
    } else if (payload.type === JwtTokenType.TENANT_USER) {
      await this.revokeAll(payload.sub);
    }
  }

  /**
   * Ends a platform admin's access tokens (they have no refresh tokens). A password change passes `exceptCurrentSecond` because its
   * caller is handed a fresh token straight afterwards.
   */
  async revokePlatformAdminSessions(
    adminId: string,
    options: { exceptCurrentSecond?: boolean } = {}
  ): Promise<void> {
    await this.sessionRevocationService.revokeUser(adminId, options);
  }

  private signAccessToken(user: TokenSubject, expiresInSeconds?: number): string {
    const accessPayload: TenantJwtPayload = {
      sub: user.id,
      tenantId: user.tenantId,
      email: user.email,
      role: user.role,
      locale: user.locale,
      type: JwtTokenType.TENANT_USER,
    };
    return expiresInSeconds === undefined
      ? this.jwtService.sign(accessPayload)
      : this.jwtService.sign(accessPayload, { expiresIn: expiresInSeconds });
  }

  /**
   * Re-signs the access token alone for a mid-session claim update (e.g. `locale`). Must not use
   * `issueTokenPair`: anyone holding only a leaked access token (it travels in the JSON body for
   * Bearer clients) could mint an indefinitely-rotatable 7-day refresh token. `expiresInSeconds` must be the remaining lifetime of the
   * presenting token, for the same reason as `signPlatformAdminAccessToken`: with a fresh TTL on every call this route would be a
   * session-extension primitive that outlives logout and a password change, which cannot reach an access token.
   */
  reissueAccessToken(
    user: TokenSubject,
    expiresInSeconds: number = ACCESS_TOKEN_TTL_SECONDS
  ): { accessToken: string; expiresIn: number } {
    return {
      accessToken: this.signAccessToken(user, expiresInSeconds),
      expiresIn: expiresInSeconds,
    };
  }

  /**
   * Access token only: no `refresh_tokens` row exists for platform admins (`user_id` FKs to
   * `users`), so an admin re-authenticates when the 15-minute TTL lapses. `expiresInSeconds` is for
   * re-signing an already-authenticated admin's token mid-session
   * (`AdminSettingsService.updateLocale`): it must be the remaining lifetime of the presenting
   * token, or the route becomes a session-extension primitive. Sign-in paths omit it.
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

  /**
   * `expiresIn` is the access token's lifetime (what the client schedules its refresh around), not
   * the refresh token's.
   */
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

  /**
   * Anything else signed with this secret (an access token) is not a refresh token, hence the
   * `type` check.
   */
  private verifyRefreshToken(
    rawRefreshToken: string,
    options: { ignoreExpiration?: boolean } = {}
  ): RefreshJwtPayload {
    let payload: Partial<RefreshJwtPayload>;
    try {
      payload = this.jwtService.verify<Partial<RefreshJwtPayload>>(rawRefreshToken, {
        secret: this.refreshSecret(),
        // Pinned so a token cannot dictate how it is verified; defence in depth if the secret ever
        // becomes a key object.
        algorithms: [JWT_SIGNING_ALGORITHM],
        ...(options.ignoreExpiration === true ? { ignoreExpiration: true } : {}),
      });
    } catch {
      throw new InvalidRefreshTokenException();
    }

    if (
      payload.type !== JwtTokenType.REFRESH ||
      typeof payload.sub !== 'string' ||
      typeof payload.jti !== 'string'
    ) {
      throw new InvalidRefreshTokenException();
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
