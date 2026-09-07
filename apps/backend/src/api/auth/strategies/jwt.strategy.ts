import { MESSAGES } from '@common/constants/messages.constants';
import { EnvConfig } from '@config/env.config';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';

import { JwtTokenType } from '../enums/jwt-token-type.enum';
import { UserRole } from '../enums/user-role.enum';
import { AuthUser } from '../types/auth-user.type';
import { fromAccessTokenCookie } from '../utils/jwt-cookie-extractor.util';

/** Untyped on purpose — a verified signature proves who signed it, not that the claims have the shape this module expects. */
interface UnverifiedClaims {
  sub?: unknown;
  email?: unknown;
  tenantId?: unknown;
  role?: unknown;
  type?: unknown;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(configService: ConfigService<EnvConfig>) {
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
    });
  }

  /**
   * Fails closed: only the two principal types are ever turned into a request user, and only
   * when their identifying claims are all present. Previously anything that wasn't
   * `platform_admin` fell through to the tenant-user branch — so a payload with no `type` (or a
   * refresh token, when JWT_REFRESH_SECRET falls back to JWT_SECRET in dev) became a tenant user
   * with an undefined `tenantId`.
   */
  validate(payload: UnverifiedClaims): AuthUser {
    if (typeof payload.sub !== 'string' || typeof payload.email !== 'string') {
      throw new UnauthorizedException(MESSAGES.AUTH.INVALID_ACCESS_TOKEN);
    }

    if (payload.type === JwtTokenType.PLATFORM_ADMIN) {
      return { type: JwtTokenType.PLATFORM_ADMIN, id: payload.sub, email: payload.email };
    }

    if (
      payload.type === JwtTokenType.TENANT_USER &&
      typeof payload.tenantId === 'string' &&
      (payload.role === UserRole.MEMBER || payload.role === UserRole.OWNER)
    ) {
      return {
        type: JwtTokenType.TENANT_USER,
        id: payload.sub,
        tenantId: payload.tenantId,
        email: payload.email,
        role: payload.role,
      };
    }

    throw new UnauthorizedException(MESSAGES.AUTH.INVALID_ACCESS_TOKEN);
  }
}
