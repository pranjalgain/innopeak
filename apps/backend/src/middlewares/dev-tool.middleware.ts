import { ACCESS_TOKEN_COOKIE_NAME, JWT_SIGNING_ALGORITHM } from '@auth/constants/auth.constants';
import { JwtTokenType } from '@auth/enums/jwt-token-type.enum';
import { RouteNames } from '@common/route-names';
import type { EnvConfig } from '@config/env.config';
import type { ConfigService } from '@nestjs/config';
import type { JwtService } from '@nestjs/jwt';
import type { NextFunction, Request, RequestHandler, Response } from 'express';

/**
 * Path prefixes the ops guard protects. The important one — Bull Board at `admin/queues` — is a
 * separate Express sub-app that Nest's router does not know about, so a `MiddlewareConsumer`
 * binding never attaches to it (verified: a per-route binding fired for the Nest-routed health UI
 * but never for Bull Board). This guard is therefore registered as raw Express middleware in
 * `bootstrap.ts`, which runs for every request — sub-apps included — before routing.
 *
 * `dev-tools/queues` lives under `dev-tools`, so the base prefix covers it. Swagger (`api`) is
 * deliberately absent: it carries no runtime data and is only mounted outside production.
 */
const PROTECTED_PREFIXES = [
  `/${RouteNames.QUEUES_UI}`,
  `/${RouteNames.DEV_TOOLS}`,
  `/${RouteNames.HEALTH}/${RouteNames.HEALTH_UI}`,
];

/**
 * Case-insensitive: Express's own router matches routes case-insensitively by default (`case
 * sensitive routing` is off unless a app explicitly enables it, and neither this app nor Bull
 * Board's sub-app does), so `/Admin/Queues` still reaches Bull Board even though it doesn't
 * equal the lowercase prefix below. Comparing case-sensitively let a differently-cased request
 * skip this guard entirely while still being routed to the protected sub-app underneath it.
 */
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
 * Builds the auth guard for the out-of-band operational surfaces (Bull Board, the dev-tools
 * dashboard, the health UI). Those bypass the global `JwtAuthGuard`/`RolesGuard` — Bull Board
 * because it is an Express sub-app, the others because this guard historically fronted them — and
 * the previous implementation was a no-op that left all of them world-readable in every
 * environment, production included. Bull Board's email-OTP job payloads made that an
 * account-takeover path.
 *
 * The returned handler requires a valid platform-admin access token, verified exactly as
 * `JwtStrategy` does: same secret, HS256 pinned so a token cannot pick its own algorithm, expiry
 * enforced, and `type` required to be `platform_admin` (a tenant-user token is rejected). Requests
 * to anything outside the protected prefixes pass straight through.
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
