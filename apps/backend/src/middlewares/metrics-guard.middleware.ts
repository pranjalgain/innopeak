import { RouteNames } from '@common/route-names';
import type { EnvConfig } from '@config/env.config';
import type { ConfigService } from '@nestjs/config';
import type { NextFunction, Request, RequestHandler, Response } from 'express';

import { createHash, timingSafeEqual } from 'crypto';

const METRICS_PATH = `/${RouteNames.METRICS}`;

/** Compared as fixed-length digests so neither the length of the token nor where it first differs shows in the response time. */
function tokensMatch(presented: string, expected: string): boolean {
  const digest = (value: string): Buffer => createHash('sha256').update(value).digest();
  return timingSafeEqual(digest(presented), digest(expected));
}

/**
 * Requires `Authorization: Bearer <METRICS_TOKEN>` on `/metrics`, the Prometheus scrape endpoint. Its output names every route,
 * user-agent and referer the API has served, which is reconnaissance material for anyone who can reach the port. Registered as
 * raw Express middleware (like the ops-tools guard) so it applies before routing, whichever handler serves the path.
 *
 * No token configured means no check, which is the local-development default; production refuses to boot without one.
 */
export function createMetricsGuard(configService: ConfigService<EnvConfig>): RequestHandler {
  const expected = configService.get<string>('METRICS_TOKEN') ?? '';

  return (req: Request, res: Response, next: NextFunction): void => {
    // Express routes case-insensitively and ignores a trailing slash, so `/Metrics/` still reaches the handler.
    if (expected === '' || req.path.toLowerCase().replace(/\/+$/, '') !== METRICS_PATH) {
      next();
      return;
    }

    const header = req.headers.authorization ?? '';
    const presented = header.startsWith('Bearer ') ? header.slice('Bearer '.length) : '';

    if (presented === '' || !tokensMatch(presented, expected)) {
      res
        .status(401)
        .json({ statusCode: 401, status: 'Failure', message: 'Metrics token required.' });
      return;
    }

    next();
  };
}
