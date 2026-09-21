import type { MockAuthContext } from "./auth-context";
import { failure, type MockEnvelope } from "./response";

export interface MockRequestContext {
  params: Record<string, string>;
  /** Merges the URL's own query string with axios's separate `config.params` object — the
   *  generated SDK always uses the latter, but this covers both without the router needing to
   *  know which one a given call happened to use. */
  query: URLSearchParams;
  body: unknown;
  auth: MockAuthContext | null;
}

export type MockHandler = (ctx: MockRequestContext) => MockEnvelope<unknown>;

export interface RouteDef {
  method: string;
  /** e.g. `/v1/reviews/:reviewId` — `:name` segments are captured into `ctx.params`. */
  pattern: string;
  handler: MockHandler;
}

/** Small home-grown builder purely so each handler file reads as a flat list, not a class. */
export function defineRoutes(routes: RouteDef[]): RouteDef[] {
  return routes;
}

interface CompiledRoute extends RouteDef {
  segments: string[];
}

function compile(route: RouteDef): CompiledRoute {
  return { ...route, segments: route.pattern.split("/").filter(Boolean) };
}

function matchPath(segments: string[], pathSegments: string[]): Record<string, string> | null {
  if (segments.length !== pathSegments.length) return null;
  const params: Record<string, string> = {};
  for (let i = 0; i < segments.length; i += 1) {
    const segment = segments[i]!;
    const actual = pathSegments[i]!;
    if (segment.startsWith(":")) {
      params[segment.slice(1)] = decodeURIComponent(actual);
    } else if (segment !== actual) {
      return null;
    }
  }
  return params;
}

export class MockRouter {
  private readonly compiled: CompiledRoute[];

  constructor(routes: RouteDef[]) {
    this.compiled = routes.map(compile);
  }

  /** Returns null when nothing matches the path at all (any method) — the adapter turns that into
   *  a network-level failure, distinct from a matched path whose method isn't supported (405-ish,
   *  treated as 404 here since nothing in this app's error handling distinguishes the two). */
  handle(
    method: string,
    pathname: string,
    query: URLSearchParams,
    body: unknown,
    auth: MockAuthContext | null,
  ): MockEnvelope<unknown> {
    const pathSegments = pathname.split("/").filter(Boolean);
    const upperMethod = method.toUpperCase();

    for (const route of this.compiled) {
      const params = matchPath(route.segments, pathSegments);
      if (params && route.method === upperMethod) {
        return route.handler({ params, query, body, auth });
      }
    }

    return failure(404, `No mock route for ${upperMethod} ${pathname}.`);
  }
}
