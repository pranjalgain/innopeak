import {
  ADMIN_ACCESS_TOKEN_COOKIE_NAME,
  JWT_SIGNING_ALGORITHM,
} from '@auth/constants/auth.constants';
import { JwtTokenType } from '@auth/enums/jwt-token-type.enum';
import { PlatformAdminStatus } from '@auth/enums/platform-admin-status.enum';
import type { SessionRevocationService } from '@auth/services/session-revocation.service';
import { RouteNames } from '@common/route-names';
import type { EnvConfig } from '@config/env.config';
import type { PlatformAdminDbService } from '@db/repositories/platform-admin/platform-admin.db-service';
import type { ConfigService } from '@nestjs/config';
import type { JwtService } from '@nestjs/jwt';
import type { NextFunction, Request, Response } from 'express';

// Bull Board is an Express sub-app Nest's router doesn't know about, so a `MiddlewareConsumer`
// binding never attaches to it; the guard is registered as raw Express middleware in `bootstrap.ts`.
// Swagger (`api`) is deliberately absent: no runtime data, and only mounted outside production.
const PROTECTED_PREFIXES = [`/${RouteNames.QUEUES_UI}`];

// Case-insensitive because Express routes that way by default: `/Admin/Queues` still reaches Bull Board.
function isProtectedPath(path: string): boolean {
  const lowerPath = path.toLowerCase();
  return PROTECTED_PREFIXES.some(
    prefix => lowerPath === prefix || lowerPath.startsWith(`${prefix}/`)
  );
}

/**
 * The admin cookie first (how a platform admin's browser reaches Bull Board), Bearer header as the fallback. Not the tenant
 * `access_token` cookie: admins sign in with `admin_access_token`, so reading the tenant one locked every admin's browser out
 * (and a tenant session, which can never be accepted here, was the only thing it could find).
 */
function extractToken(req: Request): string | null {
  const cookies = req.cookies as Record<string, string | undefined> | undefined;
  const fromCookie = cookies?.[ADMIN_ACCESS_TOKEN_COOKIE_NAME];
  if (fromCookie) return fromCookie;

  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) return authHeader.slice('Bearer '.length);

  return null;
}

function deny(res: Response, statusCode: number, message: string): void {
  res.status(statusCode).json({ statusCode, status: 'Failure', message });
}

/**
 * Guards the out-of-band ops surfaces, which bypass the global `JwtAuthGuard`/`RolesGuard`. Bull
 * Board's email-OTP job payloads make it an account-takeover path if left open.
 * Verified like `JwtStrategy`: same secret, HS256 pinned, expiry enforced, `type` must be `platform_admin`, and a token issued before the
 * admin logged out or changed their password is refused (the "not before" mark), so a copied token does not keep opening the queues.
 */
export function createOpsToolsGuard(
  jwtService: JwtService,
  configService: ConfigService<EnvConfig>,
  adminStatuses: Pick<PlatformAdminDbService, 'findStatusById'>,
  revocation: Pick<SessionRevocationService, 'isRevoked'>
): (req: Request, res: Response, next: NextFunction) => Promise<void> {
  const secret = configService.get<string>('JWT_SECRET') ?? '';

  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    if (!isProtectedPath(req.path)) {
      next();
      return;
    }

    const token = extractToken(req);
    if (!token) {
      deny(res, 401, 'Platform-admin authentication required.');
      return;
    }

    let adminId: string;
    let issuedAt: number | undefined;
    try {
      const payload = jwtService.verify<{ type?: unknown; sub?: unknown; iat?: unknown }>(token, {
        secret,
        algorithms: [JWT_SIGNING_ALGORITHM],
      });
      if (payload.type !== JwtTokenType.PLATFORM_ADMIN) {
        deny(res, 403, 'Platform-admin access required.');
        return;
      }
      if (typeof payload.sub !== 'string') {
        deny(res, 401, 'Invalid or expired token.');
        return;
      }
      adminId = payload.sub;
      issuedAt = typeof payload.iat === 'number' ? payload.iat : undefined;
    } catch {
      deny(res, 401, 'Invalid or expired token.');
      return;
    }

    // A live token is not enough: like `JwtStrategy.validate`, a disabled or deleted admin must lose access at once, not when
    // their (up to 15-minute) token lapses. Bull Board's job payloads carry email OTPs.
    try {
      if ((await adminStatuses.findStatusById(adminId)) !== PlatformAdminStatus.ACTIVE) {
        deny(res, 403, 'Platform-admin access required.');
        return;
      }
    } catch {
      deny(res, 503, 'Could not verify the account. Try again.');
      return;
    }

    // Fails open on a Redis outage, like `JwtStrategy`: the status check above is the hard gate.
    if (await revocation.isRevoked({ userId: adminId, issuedAt })) {
      deny(res, 401, 'Invalid or expired token.');
      return;
    }

    next();
  };
}
