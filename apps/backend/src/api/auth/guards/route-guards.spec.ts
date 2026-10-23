import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';

import { readdirSync, statSync } from 'fs';
import { join, resolve } from 'path';

import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { type RoleRequirement, ROLES_KEY } from '../decorators/roles.decorator';
import { JwtTokenType } from '../enums/jwt-token-type.enum';

interface Route {
  controller: string;
  handler: string;
  path: string;
  isPublic: boolean;
  roles: RoleRequirement[];
}

const SRC_ROOT = resolve(__dirname, '../../..');

function controllerFiles(dir: string): string[] {
  return readdirSync(dir).flatMap(entry => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      return controllerFiles(full);
    }
    return entry.endsWith('.controller.ts') ? [full] : [];
  });
}

/** Every HTTP route of every controller, with what `JwtAuthGuard` and `RolesGuard` will read for it (handler first, then class). */
async function discoverRoutes(): Promise<Route[]> {
  const routes: Route[] = [];

  for (const file of controllerFiles(SRC_ROOT)) {
    const exported = (await import(file)) as Record<string, unknown>;

    for (const [name, value] of Object.entries(exported)) {
      if (typeof value !== 'function' || Reflect.getMetadata(PATH_METADATA, value) === undefined) {
        continue;
      }

      const basePath = String(Reflect.getMetadata(PATH_METADATA, value));
      for (const handlerName of Object.getOwnPropertyNames(value.prototype)) {
        const handler = (value.prototype as Record<string, unknown>)[handlerName];
        if (
          typeof handler !== 'function' ||
          Reflect.getMetadata(METHOD_METADATA, handler) === undefined
        ) {
          continue;
        }

        const handlerPath = String(Reflect.getMetadata(PATH_METADATA, handler));
        const pick = <T>(key: string): T | undefined =>
          (Reflect.getMetadata(key, handler) ?? Reflect.getMetadata(key, value)) as T | undefined;

        routes.push({
          controller: name,
          handler: handlerName,
          path: [basePath, handlerPath === '/' ? '' : handlerPath].filter(Boolean).join('/'),
          isPublic: pick<boolean>(IS_PUBLIC_KEY) === true,
          roles: pick<RoleRequirement[]>(ROLES_KEY) ?? [],
        });
      }
    }
  }

  return routes;
}

const describeRoute = (route: Route): string =>
  `${route.controller}.${route.handler} (${route.path})`;

/**
 * `RolesGuard` treats a route with no `@Roles()` as a tenant route, so a route under the admin area that forgot its
 * `@Roles(PLATFORM_ADMIN)` would be open to any tenant user. The guard cannot catch that, so this does: it reads the real decorators
 * off every controller, the same way the guards do.
 */
describe('route guards across every controller', () => {
  let routes: Route[];

  beforeAll(async () => {
    routes = await discoverRoutes();
  });

  // Guards the guard: an enumeration that silently found nothing would make every check below pass.
  it('finds the routes it is meant to check', () => {
    expect(routes.length).toBeGreaterThan(80);
    expect(routes.some(route => route.path.startsWith('admin/'))).toBe(true);
    expect(routes.some(route => route.isPublic)).toBe(true);
  });

  it('requires PLATFORM_ADMIN on every non-public route in the admin area', () => {
    const open = routes
      .filter(route => route.path.startsWith('admin/') && !route.isPublic)
      .filter(route => !route.roles.includes(JwtTokenType.PLATFORM_ADMIN))
      .map(describeRoute);

    expect(open).toEqual([]);
  });

  // The access-token cookie is chosen by URL (`/v1/admin/...` reads `admin_access_token`), so an admin-only route elsewhere would be
  // sent the wrong cookie for a browser holding both sessions.
  it('keeps every PLATFORM_ADMIN route under the admin area', () => {
    const misplaced = routes
      .filter(route => route.roles.includes(JwtTokenType.PLATFORM_ADMIN))
      .filter(route => !route.path.startsWith('admin/'))
      .map(describeRoute);

    expect(misplaced).toEqual([]);
  });

  it('never lists a role on a route that is also public, where it would never be checked', () => {
    const pointless = routes
      .filter(route => route.isPublic && route.roles.length > 0)
      .map(describeRoute);

    expect(pointless).toEqual([]);
  });
});
