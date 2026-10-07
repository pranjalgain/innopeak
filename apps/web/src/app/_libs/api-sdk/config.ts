import { Configuration } from "@innopeak/client-sdk";
import axios, { type AxiosError, type InternalAxiosRequestConfig } from "axios";

import { ApiError } from "@/app/_libs/services/api-error";
import { TokenService } from "@/app/_libs/services/token.service";

// Generated `*Api` classes fall back to the global `axios` default export when their `Configuration` has no
// instance, so one pair of interceptors installed here covers every SDK call.
interface InnopeakRequestOptions {
  /** Exempts public routes (login, signup, refresh) from refresh-and-retry: a 401 there is expected, not a lapsed session. */
  authOptional?: boolean;
  /** Never refresh-and-retry on a 401: needed for the refresh call itself (would recurse) and change/set-password, where a wrong current password is also a 401. */
  skipRefresh?: boolean;
}

// Augment only `AxiosRequestConfig` and match its exact arity (`<D = any, P = any>`): a different number of type
// parameters declares a separate interface that silently fails to merge. From axios 1.16 `RawAxiosRequestConfig` (SDK
// methods) and `InternalAxiosRequestConfig` (interceptors) both resolve to it, and as a type alias the former can't be reopened.
declare module "axios" {
  // Empty body, unused `D`/`P` and `any` are required: the type parameter list must match axios's or the merge silently fails.
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type, @typescript-eslint/no-explicit-any, unused-imports/no-unused-vars
  export interface AxiosRequestConfig<D = any, P = any> extends InnopeakRequestOptions {}
}

/**
 * Requests go to this app's own origin; `next.config.ts` rewrites `/v1/*` to the API. That keeps auth cookies first-party:
 * a cookie set on another host is invisible to the edge middleware in `proxy.ts`, which would redirect every signed-in visitor to /login.
 */
export const apiConfig = new Configuration({
  basePath: "",
  baseOptions: { withCredentials: true },
});

const REFRESH_PATH = "/v1/auth/refresh";

interface RefreshResponseData {
  user?: { name?: string };
}

/**
 * In-flight refresh shared by concurrent 401s. Load-bearing: the backend rotates refresh tokens strictly single-use,
 * so two concurrent refreshes would race and one would be rejected. Only within one JS context; `doRefresh` handles other tabs.
 */
let refreshInFlight: Promise<boolean> | null = null;

/** A refresh attempt's outcome. The status is kept because only a 401 is worth retrying. */
type RefreshAttempt = { ok: true } | { ok: false; status: number };

async function attemptRefresh(): Promise<RefreshAttempt> {
  try {
    const response = await axios.post<{ data?: RefreshResponseData }>(REFRESH_PATH, undefined, {
      withCredentials: true,
      authOptional: true,
      skipRefresh: true,
    });
    // The httpOnly cookies are already set; only `name` is read from the body, the one way a redirect-only Google
    // sign-in gets its display name (`useAuthToken` calls this when the session cookie says signed-in but nothing is cached).
    const name = response.data.data?.user?.name;
    if (name) TokenService.setName(name);
    return { ok: true };
  } catch (error) {
    // Already turned into an ApiError by the response interceptor; a transport failure with no response has status 0.
    return { ok: false, status: error instanceof ApiError ? error.statusCode : 0 };
  }
}

async function doRefresh(): Promise<boolean> {
  refreshInFlight ??= (async (): Promise<boolean> => {
    const first = await attemptRefresh();
    if (first.ok) return true;

    // `refreshInFlight` only dedupes within one JS context, so two tabs waking from idle can rotate at once. Refresh tokens
    // are single-use: the backend serves the winner and 401s the loser, leaving its cookies intact
    // (`RefreshTokenSupersededException`), a 401 byte-identical to a dead session's. Asking again is the only way to tell
    // them apart (the loser's second attempt presents the successor); skipping it cleared live sessions and bounced tabs through /login.
    // Only a 401 earns the retry: retrying a 429 (refresh is throttled to 20/min per IP) or a 5xx only adds load.
    if (first.status !== 401) return false;

    // A browser never signed in here cannot have lost a race; retrying would double every anonymous visitor's cost against the shared throttle.
    if (!TokenService.hasSession()) return false;

    return (await attemptRefresh()).ok;
  })();

  try {
    return await refreshInFlight;
  } finally {
    refreshInFlight = null;
  }
}

/** Exposed so callers can revive a session up front rather than waiting on a 401. */
export function refreshSession(): Promise<boolean> {
  return doRefresh();
}

let installed = false;

/**
 * Installs the interceptors on the global axios instance once, at module load: every `api-sdk/*.ts` imports this
 * module, so the first SDK call guarantees it ran. Safe during SSR since no request exists yet.
 */
function installApiInterceptors(): void {
  if (installed) return;
  installed = true;

  axios.interceptors.response.use(
    (response) => response,
    async (error: AxiosError) => {
      const config = error.config as
        (InternalAxiosRequestConfig & { _retried?: boolean }) | undefined;

      // A 401 means the 15-minute access token lapsed, not that the session is over (the refresh cookie lasts 7 days):
      // refresh once and replay. `_retried` stops a second loop on the same request.
      if (
        error.response?.status === 401 &&
        config &&
        !config.authOptional &&
        !config.skipRefresh &&
        !config._retried
      ) {
        const refreshed = await refreshSession();

        if (refreshed) {
          config._retried = true;
          return axios(config);
        }
        // Only the cached display name needs clearing: the principal is read off the `session` cookie, which the backend
        // clears itself. A platform admin has no refresh token, so their 15-minute expiry runs through here.
        TokenService.clear();
      }

      const data = error.response?.data as { message?: string; error?: string } | undefined;
      throw new ApiError(
        error.response?.status ?? 0,
        data?.message ?? error.message ?? "Request failed",
        data?.error,
      );
    },
  );
}

installApiInterceptors();
