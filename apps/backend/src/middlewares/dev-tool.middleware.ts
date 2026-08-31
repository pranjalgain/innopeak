// TODO: Uncomment and implement the middleware logic as needed

// import { RoleType } from '@common/enums/role-type.enum';
// import { RouteNames } from '@common/route-names';
// import { CustomJwtService } from '@common/services/jwt.service';
import { Injectable, NestMiddleware } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';
@Injectable()
export class DevToolsMiddleware implements NestMiddleware {
  // constructor(private readonly jwtService: CustomJwtService) {}

  use(_req: Request, _res: Response, next: NextFunction): void {
    // let token = req.cookies?.['admin_sid'];

    // if (!token && !req.headers['authorization']) {
    //   return res.status(401).json({
    //     status: 'Unauthorized',
    //     message: 'Missing admin session',
    //   });
    // } else if (token && !req.headers['authorization']) {
    //   req.headers['authorization'] = `Bearer ${token}`;
    // } else {
    //   token = req.headers['authorization'].split(' ')[1];
    // }

    // if (req.baseUrl.includes(RouteNames.API_DOCS) || req.baseUrl.includes(RouteNames.QUEUES_UI)) {
    //   const decoded = await this.jwtService.verifyAccessToken(token);

    //   if (!decoded?.roles?.some((role) => role.name === RoleType.ADMIN)) {
    //     return res.status(401).json({
    //       status: 'Unauthorized',
    //       message: 'Invalid or expired admin session',
    //     });
    //   }
    // }

    // TODO: Apply rate limiting to /api and /queues routes

    next();
  }
}
