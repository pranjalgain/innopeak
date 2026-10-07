import { isSupportedLocale, type Locale } from '@common/i18n/locale';
import { EnvConfig } from '@config/env.config';
import { PlatformAdminDbService } from '@db/repositories/platform-admin/platform-admin.db-service';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';

import { JWT_SIGNING_ALGORITHM } from '../constants/auth.constants';
import { JwtTokenType } from '../enums/jwt-token-type.enum';
import { PlatformAdminStatus } from '../enums/platform-admin-status.enum';
import { UserRole } from '../enums/user-role.enum';
import {
  InvalidAccessTokenException,
  PlatformAdminAccountDisabledException,
} from '../exceptions/auth.exceptions';
import { AuthUser } from '../types/auth.type';
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
      // Cookie first (what same-origin browser requests carry); Bearer header is the fallback for
      // Swagger UI, mobile and service-to-service callers.
      jwtFromRequest: ExtractJwt.fromExtractors([
        fromAccessTokenCookie,
        ExtractJwt.fromAuthHeaderAsBearerToken(),
      ]),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('JWT_SECRET') ?? '',
      // Pinned so a token cannot dictate how it is verified (algorithm confusion); defence in
      // depth that stays true if the secret ever becomes a key object.
      algorithms: [JWT_SIGNING_ALGORITHM],
    });
  }

  /**
   * Fails closed: only the two principal types become a request user, and only with all their
   * identifying claims. Platform-admin tokens are re-checked against the DB on every request (the
   * JWT carries no status) so a disabled admin loses access at once; tenant users are not, since
   * their suspension is enforced at refresh and a per-request read would be a hot-path cost.
   */
  async validate(payload: UnverifiedClaims): Promise<AuthUser> {
    if (typeof payload.sub !== 'string' || typeof payload.email !== 'string') {
      throw new InvalidAccessTokenException();
    }

    if (payload.type === JwtTokenType.PLATFORM_ADMIN) {
      const status = await this.platformAdminDbService.findStatusById(payload.sub);
      // null = the admin row was deleted; disabled/invited must not hold a live session.
      if (status !== PlatformAdminStatus.ACTIVE) {
        throw new PlatformAdminAccountDisabledException();
      }
      // Same legacy-token fallback as the tenant branch below.
      const locale: Locale | null = isSupportedLocale(payload.locale) ? payload.locale : null;
      return {
        type: JwtTokenType.PLATFORM_ADMIN,
        id: payload.sub,
        email: payload.email,
        locale,
        // Lets a mid-session claim refresh re-sign to the same deadline instead of granting a fresh TTL.
        ...(typeof payload.exp === 'number' ? { sessionExpiresAt: payload.exp } : {}),
      };
    }

    if (
      payload.type === JwtTokenType.TENANT_USER &&
      typeof payload.tenantId === 'string' &&
      (payload.role === UserRole.MEMBER || payload.role === UserRole.OWNER)
    ) {
      // A token signed before the claim existed has no `locale`; treated like `null` (never chosen),
      // so resolution falls through to `Accept-Language`.
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

    throw new InvalidAccessTokenException();
  }
}
