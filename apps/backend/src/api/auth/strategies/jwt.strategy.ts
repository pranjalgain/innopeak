import { MESSAGES } from '@common/constants/messages.constants';
import { isSupportedLocale, type Locale } from '@common/i18n/locale';
import { EnvConfig } from '@config/env.config';
import { PlatformAdminDbService } from '@db/repositories/platform-admin/platform-admin.db-service';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';

import { JWT_SIGNING_ALGORITHM } from '../constants/auth.constants';
import { JwtTokenType } from '../enums/jwt-token-type.enum';
import { PlatformAdminStatus } from '../enums/platform-admin-status.enum';
import { UserRole } from '../enums/user-role.enum';
import { AuthUser } from '../types/auth-user.type';
import { fromAccessTokenCookie } from '../utils/jwt-cookie-extractor.util';

/** Untyped on purpose — a verified signature proves who signed it, not that the claims have the shape this module expects. */
interface UnverifiedClaims {
  sub?: unknown;
  email?: unknown;
  tenantId?: unknown;
  role?: unknown;
  locale?: unknown;
  type?: unknown;
  exp?: unknown;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    configService: ConfigService<EnvConfig>,
    private readonly platformAdminDbService: PlatformAdminDbService
  ) {
    super({
      // Cookie first: it's what a same-origin browser request actually carries automatically
      // (the frontend's fetch already sends `credentials: "include"`). The Bearer header stays
      // as a fallback for callers that can't rely on cookies — Swagger UI, a future mobile app,
      // service-to-service calls — same access token, just read from wherever it's carried.
      jwtFromRequest: ExtractJwt.fromExtractors([
        fromAccessTokenCookie,
        ExtractJwt.fromAuthHeaderAsBearerToken(),
      ]),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('JWT_SECRET') ?? '',
      // Pinned so a token cannot dictate how it is verified — the algorithm-confusion shape.
      // `jsonwebtoken` 9 already refuses an asymmetric alg against a string secret, so this is
      // defence in depth; it is what keeps that true if the secret ever becomes a key object.
      algorithms: [JWT_SIGNING_ALGORITHM],
    });
  }

  /**
   * Fails closed: only the two principal types are ever turned into a request user, and only
   * when their identifying claims are all present. Previously anything that wasn't
   * `platform_admin` fell through to the tenant-user branch — so a payload with no `type` (or a
   * refresh token, when JWT_REFRESH_SECRET falls back to JWT_SECRET in dev) became a tenant user
   * with an undefined `tenantId`.
   *
   * Async because a platform-admin token is re-checked against the DB on every request: the JWT
   * carries no status, so without this a disabled or deleted admin kept full access for the
   * token's whole 15-minute life. Only the platform-admin branch pays for the lookup — it is a
   * single indexed-PK read, and admins are few and low-traffic. Tenant users are deliberately not
   * re-checked here: their suspension/disable is enforced at the (far less frequent) refresh
   * boundary, and adding a DB read to every tenant request would be a real hot-path cost.
   */
  async validate(payload: UnverifiedClaims): Promise<AuthUser> {
    if (typeof payload.sub !== 'string' || typeof payload.email !== 'string') {
      throw new UnauthorizedException(MESSAGES.AUTH.INVALID_ACCESS_TOKEN);
    }

    if (payload.type === JwtTokenType.PLATFORM_ADMIN) {
      const status = await this.platformAdminDbService.findStatusById(payload.sub);
      // null = the admin row was deleted; disabled/invited = must not hold a live session.
      if (status !== PlatformAdminStatus.ACTIVE) {
        throw new UnauthorizedException(MESSAGES.AUTH.ACCOUNT_DISABLED);
      }
      // Same fallback as the tenant branch below: a token signed before this claim existed has
      // no `locale` at all — falls through to `Accept-Language`, same as `null` (never chosen).
      const locale: Locale | null = isSupportedLocale(payload.locale) ? payload.locale : null;
      return {
        type: JwtTokenType.PLATFORM_ADMIN,
        id: payload.sub,
        email: payload.email,
        locale,
        // Carried so a mid-session claim refresh can re-sign to this same deadline instead of
        // granting a fresh TTL — see `PlatformAdminAuthUser.sessionExpiresAt`.
        ...(typeof payload.exp === 'number' ? { sessionExpiresAt: payload.exp } : {}),
      };
    }

    if (
      payload.type === JwtTokenType.TENANT_USER &&
      typeof payload.tenantId === 'string' &&
      (payload.role === UserRole.MEMBER || payload.role === UserRole.OWNER)
    ) {
      // A token signed before this claim existed has no `locale` at all — falls through to
      // `Accept-Language` at the resolution call sites, same as `null` (never chosen).
      const locale: Locale | null = isSupportedLocale(payload.locale) ? payload.locale : null;

      return {
        type: JwtTokenType.TENANT_USER,
        id: payload.sub,
        tenantId: payload.tenantId,
        email: payload.email,
        role: payload.role,
        locale,
      };
    }

    throw new UnauthorizedException(MESSAGES.AUTH.INVALID_ACCESS_TOKEN);
  }
}
