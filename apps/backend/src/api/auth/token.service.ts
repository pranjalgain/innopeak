import { MESSAGES } from '@common/constants/messages.constants';
import { EnvConfig } from '@config/env.config';
import { AuthDbService } from '@db/repositories/auth/auth.db-service';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';

import { randomBytes } from 'crypto';

import {
  ACCESS_TOKEN_TTL_SECONDS,
  REFRESH_TOKEN_BYTES,
  REFRESH_TOKEN_TTL_SECONDS,
} from './constants/auth.constants';
import { JwtTokenType } from './enums/jwt-token-type.enum';
import { TenantStatus } from './enums/tenant-status.enum';
import { UserRole } from './enums/user-role.enum';
import { UserStatus } from './enums/user-status.enum';
import { RefreshJwtPayload, TenantJwtPayload } from './types/jwt-payload.type';
import { TokenResponse } from './types/token-response.type';
import { hashToken } from './utils/token.utils';

export interface TokenSubject {
  id: string;
  tenantId: string;
  email: string;
  role: UserRole;
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
  constructor(
    private readonly jwtService: JwtService,
    private readonly authDbService: AuthDbService,
    private readonly configService: ConfigService<EnvConfig>
  ) {}

  async issueTokenPair(user: TokenSubject): Promise<TokenResponse> {
    const signed = this.signTokenPair(user);
    await this.authDbService.insertRefreshToken(
      user.id,
      signed.refreshTokenHash,
      signed.refreshExpiresAt
    );

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
   */
  async rotate(
    rawRefreshToken: string
  ): Promise<{ tokens: TokenResponse; user: TokenSubject & { name: string } }> {
    const payload = this.verifyRefreshToken(rawRefreshToken);

    const stored = await this.authDbService.findActiveRefreshToken(hashToken(rawRefreshToken));
    if (!stored || stored.userId !== payload.sub) {
      throw new UnauthorizedException(MESSAGES.AUTH.INVALID_REFRESH_TOKEN);
    }

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
    };
    const signed = this.signTokenPair(subject);
    const rotated = await this.authDbService.rotateRefreshToken(stored.id, {
      userId: user.id,
      tokenHash: signed.refreshTokenHash,
      expiresAt: signed.refreshExpiresAt,
    });
    if (!rotated) {
      throw new UnauthorizedException(MESSAGES.AUTH.INVALID_REFRESH_TOKEN);
    }

    return { tokens: signed.tokens, user: { ...subject, name: user.name } };
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
      payload = this.verifyRefreshToken(rawRefreshToken);
    } catch {
      return;
    }

    await this.revokeAll(payload.sub);
  }

  /** Pure signing, no I/O — `expiresIn` is the *access* token's lifetime (what the client schedules its refresh around), not the refresh token's. */
  private signTokenPair(user: TokenSubject): SignedTokenPair {
    const accessPayload: TenantJwtPayload = {
      sub: user.id,
      tenantId: user.tenantId,
      email: user.email,
      role: user.role,
      type: JwtTokenType.TENANT_USER,
    };
    const accessToken = this.jwtService.sign(accessPayload);

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
  private verifyRefreshToken(rawRefreshToken: string): RefreshJwtPayload {
    let payload: Partial<RefreshJwtPayload>;
    try {
      payload = this.jwtService.verify<Partial<RefreshJwtPayload>>(rawRefreshToken, {
        secret: this.refreshSecret(),
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
