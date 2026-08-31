import type { Request } from 'express';

export function isMobileRequest(req: Request): boolean {
  return !!(req.headers['x-device'] && req.headers['x-device'] === 'mobile');
}
