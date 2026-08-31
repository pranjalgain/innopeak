import { RouteNames } from '@common/route-names';
import { Injectable, NestMiddleware } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';

@Injectable()
export class CookieAuthMiddleware implements NestMiddleware {
  use(req: Request, _res: Response, next: NextFunction): void {
    const isDevToolRequest = req.path.includes(RouteNames.DEV_TOOLS);
    const isAdmin = isDevToolRequest;

    // TODO: Add admin app/user app check based on refferrer or some other logic
    // const isAdmin = isDevToolRequest || getAdminOrUser(req);

    // `req.cookies` is typed `any` by @types/express and is only populated when
    // cookie-parser middleware runs (not currently registered), so it can genuinely
    // be `undefined` at runtime — default to `{}` rather than assuming it's always set.
    const cookies = (req.cookies as Record<string, string | undefined> | undefined) ?? {};
    const accessToken = !isAdmin ? cookies['sid'] : cookies['admin_sid'];
    const refreshToken = !isAdmin ? cookies['refresh_token'] : cookies['admin_refresh_token'];
    const tempToken = !isAdmin ? cookies['temp_sid'] : cookies['admin_temp_sid'];

    if (accessToken && !req.headers['authorization']) {
      req.headers['authorization'] = `Bearer ${accessToken}`;
    } else if (refreshToken && !req.headers['authorization']) {
      req.headers['authorization'] = `Bearer ${refreshToken}`;
    } else if (tempToken && !req.headers['authorization']) {
      req.headers['authorization'] = `Bearer ${tempToken}`;
    }

    next();
  }
}
