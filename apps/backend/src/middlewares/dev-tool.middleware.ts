import { ACCESS_TOKEN_COOKIE_NAME, JWT_SIGNING_ALGORITHM } from '@auth/constants/auth.constants';
import { JwtTokenType } from '@auth/enums/jwt-token-type.enum';
import { RouteNames } from '@common/route-names';
import type { EnvConfig } from '@config/env.config';
import type { ConfigService } from '@nestjs/config';
import type { JwtService } from '@nestjs/jwt';
import type { NextFunction, Request, RequestHandler, Response } from 'express';

// Bull Board is an Express sub-app Nest's router doesn't know about, so a `MiddlewareConsumer`
// binding never attaches to it; the guard is registered as raw Express middleware in `bootstrap.ts`.
// Swagger (`api`) is deliberately absent: no runtime data, and only mounted outside production.
const PROTECTED_PREFIXES = [
  `/${RouteNames.QUEUES_UI}`,
  `/${RouteNames.DEV_TOOLS}`,
  `/${RouteNames.HEALTH}/${RouteNames.HEALTH_UI}`,
];

// Case-insensitive because Express routes that way by default: `/Admin/Queues` still reaches Bull Board.
function isProtectedPath(path: string): boolean {
  const lowerPath = path.toLowerCase();
  return PROTECTED_PREFIXES.some(
    prefix => lowerPath === prefix || lowerPath.startsWith(`${prefix}/`)
  );
}

/** Cookie first (how an admin's browser reaches Bull Board), Bearer header as the fallback. */
function extractToken(req: Request): string | null {
  const cookies = req.cookies as Record<string, string | undefined> | undefined;
  const fromCookie = cookies?.[ACCESS_TOKEN_COOKIE_NAME];
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
 * Verified like `JwtStrategy`: same secret, HS256 pinned, expiry enforced, `type` must be `platform_admin`.
 */
export function createOpsToolsGuard(
  jwtService: JwtService,
  configService: ConfigService<EnvConfig>
): RequestHandler {
  const secret = configService.get<string>('JWT_SECRET') ?? '';

  return (req: Request, res: Response, next: NextFunction): void => {
    if (!isProtectedPath(req.path)) {
      next();
      return;
    }

    const token = extractToken(req);
    if (!token) {
      deny(res, 401, 'Platform-admin authentication required.');
      return;
    }

    try {
      const payload = jwtService.verify<{ type?: unknown }>(token, {
        secret,
        algorithms: [JWT_SIGNING_ALGORITHM],
      });
      if (payload.type !== JwtTokenType.PLATFORM_ADMIN) {
        deny(res, 403, 'Platform-admin access required.');
        return;
      }
    } catch {
      deny(res, 401, 'Invalid or expired token.');
      return;
    }

    next();
  };
}
