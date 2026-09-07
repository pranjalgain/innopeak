import { TokenService } from "./token.service";

/** Mirrors the backend's ApiResponse envelope (apps/backend/src/common/dto/api-response.ts). */
export interface ApiEnvelope<T> {
  statusCode?: number;
  status: string;
  message?: string;
  error?: string;
  traceId?: string;
  data?: T;
}

export class ApiError extends Error {
  readonly statusCode: number;
  readonly errorCode?: string;

  constructor(statusCode: number, message: string, errorCode?: string) {
    super(message);
    this.statusCode = statusCode;
    if (errorCode !== undefined) this.errorCode = errorCode;
  }
}

interface RequestOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  /** Attach the stored access token as a Bearer header. Default true — pass false for public routes like login/signup. */
  auth?: boolean;
  /** Internal: set on the retry after a refresh, so one request can never trigger a refresh loop. */
  skipRefresh?: boolean;
  /**
   * Aborts the request. Needed by anything that polls on an interval — without it, a component
   * that unmounts mid-poll leaves the response to resolve into a setState on a dead component,
   * and a slow backend lets successive polls stack up rather than replace each other.
   */
  signal?: AbortSignal;
}

const REFRESH_PATH = "/v1/auth/refresh";

/**
 * Requests go to this app's OWN origin, not directly to the backend, and `next.config.ts` rewrites
 * `/v1/*` through to the API. That indirection is what makes the auth cookies first-party: a
 * cookie the backend sets on `api.example.com` is invisible to `app.example.com`, so the edge
 * middleware in `proxy.ts` could never see a session and would redirect every signed-in visitor to
 * /login. Proxying keeps every cookie same-origin, in production exactly as in local dev — where it
 * only ever appeared to work because both apps happened to share `localhost`.
 */
const API_BASE = "";

/**
 * In-flight refresh, shared by every caller that hits a 401 at the same time.
 *
 * This is load-bearing, not an optimization: the backend rotates refresh tokens strictly
 * single-use, so two concurrent refreshes would race — the first rotates the token, the second
 * presents the now-revoked one and is rejected, and the user is signed out mid-session. Funnelling
 * them into one promise means N concurrent 401s produce exactly one rotation.
 */
let refreshInFlight: Promise<boolean> | null = null;

async function refreshSession(): Promise<boolean> {
  refreshInFlight ??= (async (): Promise<boolean> => {
    try {
      const response = await fetch(`${API_BASE}${REFRESH_PATH}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
      });

      if (!response.ok) return false;

      const envelope = (await response.json().catch(() => null)) as ApiEnvelope<{
        accessToken?: string;
      }> | null;
      const accessToken = envelope?.data?.accessToken;

      if (!accessToken) return false;

      TokenService.setAccessToken(accessToken);
      return true;
    } catch {
      return false;
    }
  })();

  try {
    return await refreshInFlight;
  } finally {
    refreshInFlight = null;
  }
}

/** Thin fetch wrapper against the NestJS backend — centralizes the base URL, auth header, refresh-on-401, and envelope parsing. */
export class ApiClient {
  static async request<T>(path: string, options: RequestOptions = {}): Promise<T> {
    let response = await this.send(path, options);

    // A 401 on an authenticated call means the 15-minute access token lapsed, not that the session
    // is over — the refresh cookie outlives it by 7 days. Refresh once and replay the request, so
    // an idle user never sees a spurious failure. On a failed refresh the stale token is cleared,
    // which is what stops the route guards from believing a dead session is still live.
    if (response.status === 401 && options.auth !== false && !options.skipRefresh) {
      const refreshed = await refreshSession();

      if (refreshed) {
        response = await this.send(path, options);
      } else {
        TokenService.clear();
      }
    }

    const envelope = (await response.json().catch(() => null)) as ApiEnvelope<T> | null;

    if (!response.ok) {
      throw new ApiError(response.status, envelope?.message ?? "Request failed", envelope?.error);
    }

    return (envelope?.data ?? (undefined as unknown)) as T;
  }

  /** Refreshes the access token from the httpOnly refresh cookie. Exposed for callers that want to revive a session up front rather than on a 401. */
  static refreshSession(): Promise<boolean> {
    return refreshSession();
  }

  private static async send(path: string, options: RequestOptions): Promise<Response> {
    const { method = "GET", body, auth = true, signal } = options;
    const headers: Record<string, string> = { "Content-Type": "application/json" };

    if (auth) {
      const token = TokenService.getAccessToken();
      if (token) headers["Authorization"] = `Bearer ${token}`;
    }

    return fetch(`${API_BASE}${path}`, {
      method,
      headers,
      // Same-origin after the rewrite, but explicit so the auth cookies travel even if the base
      // URL is ever pointed back at a cross-origin backend.
      credentials: "include",
      body: body !== undefined ? JSON.stringify(body) : undefined,
      ...(signal ? { signal } : {}),
    });
  }
}
