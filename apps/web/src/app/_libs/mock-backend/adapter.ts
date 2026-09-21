import { type AxiosAdapter, AxiosHeaders, type InternalAxiosRequestConfig } from "axios";

import { decodeAuthHeader } from "./auth-context";
import { adminAuthRoutes } from "./handlers/admin-auth";
import { adminBusinessesRoutes } from "./handlers/admin-businesses";
import { adminOverviewRoutes } from "./handlers/admin-overview";
import { adminSettingsRoutes } from "./handlers/admin-settings";
import { adminUsersRoutes } from "./handlers/admin-users";
import { authRoutes } from "./handlers/auth";
import { connectionsRoutes } from "./handlers/connections";
import { dashboardRoutes } from "./handlers/dashboard";
import { notificationsRoutes } from "./handlers/notifications";
import { promptsRoutes } from "./handlers/prompts";
import { reviewsRoutes } from "./handlers/reviews";
import { settingsRoutes } from "./handlers/settings";
import { MockApiFailure, type MockAxiosResponse } from "./response";
import { MockRouter } from "./router";
import { persistDb } from "./state";

const router = new MockRouter([
  ...authRoutes,
  ...adminAuthRoutes,
  ...adminSettingsRoutes,
  ...adminOverviewRoutes,
  ...adminUsersRoutes,
  ...adminBusinessesRoutes,
  ...dashboardRoutes,
  ...reviewsRoutes,
  ...notificationsRoutes,
  ...settingsRoutes,
  ...promptsRoutes,
  ...connectionsRoutes,
]);

/** A handful of `dispatchRequest`'s own steps have already run by the time an adapter sees
 *  `config`, but not the ones that matter here: `config.url` may still be relative (resolved
 *  against `config.baseURL` below) and `config.params` has not yet been merged into it. Both are
 *  read directly instead. */
function resolveUrl(config: InternalAxiosRequestConfig): URL {
  const base =
    config.baseURL || (typeof window === "undefined" ? "http://localhost" : window.location.origin);
  return new URL(config.url ?? "", base);
}

function buildQuery(url: URL, config: InternalAxiosRequestConfig): URLSearchParams {
  const query = new URLSearchParams(url.search);
  const configParams = config.params as Record<string, unknown> | undefined;
  if (configParams) {
    for (const [key, value] of Object.entries(configParams)) {
      if (value === undefined || value === null) continue;
      query.set(key, String(value));
    }
  }
  return query;
}

function parseBody(data: unknown): unknown {
  if (typeof data !== "string") return data;
  if (data.length === 0) return undefined;
  try {
    return JSON.parse(data);
  } catch {
    return data;
  }
}

function headerValue(config: InternalAxiosRequestConfig, name: string): string | undefined {
  const headers = config.headers;
  if (!headers) return undefined;
  const value =
    headers instanceof AxiosHeaders
      ? headers.get(name)
      : (headers as Record<string, unknown>)[name];
  return typeof value === "string" ? value : undefined;
}

/** Small, deliberately visible delay — a real network call is never instant, and every loading
 *  skeleton/spinner this UI already has would otherwise never render, which is itself misleading
 *  in a preview meant to show the real thing. */
function simulatedLatency(): Promise<void> {
  const ms = 150 + Math.random() * 250;
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Replaces axios's real transport for this deploy — see `api-sdk/config.ts` for where this is
 * installed. Every `*Api` class in `@innopeak/client-sdk` still builds its request exactly as it
 * would against a real backend (method, URL, params, body, headers); this only intercepts the one
 * step that would otherwise open a socket, and answers from `state.ts`'s in-memory data instead.
 */
export const mockAdapter: AxiosAdapter = async (config) => {
  await simulatedLatency();

  try {
    const url = resolveUrl(config);
    const query = buildQuery(url, config);
    const body = parseBody(config.data);
    const auth = decodeAuthHeader(headerValue(config, "Authorization"));
    const method = config.method ?? "get";

    const envelope = router.handle(method, url.pathname, query, body, auth);

    // A GET can't have changed anything, so this skips re-serializing the whole store (reviews,
    // notifications, everything) on every read — the common case by far, and the one place a
    // per-request cost here would actually be felt (dashboard polling, the notification bell).
    if (method.toUpperCase() !== "GET") persistDb();

    const response: MockAxiosResponse = {
      data: envelope,
      status: envelope.statusCode,
      statusText: "OK",
      headers: { "content-type": "application/json" },
      config,
    };
    return response;
  } catch (error) {
    const status = error instanceof MockApiFailure ? error.status : 500;
    const message =
      error instanceof MockApiFailure ? error.message : "Unexpected mock backend error.";
    const errorCode = error instanceof MockApiFailure ? error.errorCode : undefined;

    // Shaped to match exactly what a real rejected axios request looks like, since
    // `api-sdk/config.ts`'s response interceptor (real, unmodified code) reads `error.response`.
    const axiosLikeError = Object.assign(new Error(message), {
      isAxiosError: true,
      config,
      response: {
        status,
        statusText: message,
        headers: {},
        config,
        data: { status: "error", statusCode: status, message, error: errorCode },
      },
    });
    throw axiosLikeError;
  }
};
