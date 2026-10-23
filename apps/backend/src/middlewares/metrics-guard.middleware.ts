import { RouteNames } from '@common/route-names';
import { isLocalDevelopment } from '@config/deployment-target.util';
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
 * No token configured means no check only on a local machine. Anywhere else (production refuses to boot without one, but a staging box runs
 * as `development`) `/metrics` is refused rather than served to whoever can reach the port.
 */
export function createMetricsGuard(configService: ConfigService<EnvConfig>): RequestHandler {
  const expected = configService.get<string>('METRICS_TOKEN') ?? '';
  const openForLocalUse = isLocalDevelopment();

  return (req: Request, res: Response, next: NextFunction): void => {
    // Express routes case-insensitively and ignores a trailing slash, so `/Metrics/` still reaches the handler.
    if (req.path.toLowerCase().replace(/\/+$/, '') !== METRICS_PATH) {
      next();
      return;
    }

    if (expected === '') {
      if (openForLocalUse) {
        next();
        return;
      }
      res
        .status(503)
        .json({ statusCode: 503, status: 'Failure', message: 'Metrics are not configured.' });
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
