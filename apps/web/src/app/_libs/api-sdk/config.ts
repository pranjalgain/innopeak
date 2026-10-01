import { Configuration } from "@innopeak/client-sdk";
import axios, { type AxiosError, type InternalAxiosRequestConfig } from "axios";

import { ApiError } from "@/app/_libs/services/api-error";
import { TokenService } from "@/app/_libs/services/token.service";

// Every generated `*Api` class in `@innopeak/client-sdk` falls back to the global `axios` default
// export whenever its `Configuration` doesn't carry an explicit instance — that's what lets ONE
// pair of interceptors installed here cover every SDK call, without threading an axios instance
// through each `api-sdk/*.ts` file.
interface InnopeakRequestOptions {
  /** Skip the refresh-and-retry dance's exemption on a 401 from this request — for public routes (login, signup, refresh itself, etc), where a 401 is an expected outcome, not a lapsed session. */
  authOptional?: boolean;
  /** Never attempt the refresh-and-retry dance on a 401 from this request. Load-bearing for the refresh call itself (would otherwise recurse) and for change/set-password, where a wrong current password is also a 401 that must not be mistaken for an expired access token. */
  skipRefresh?: boolean;
}

// Both interfaces are augmented: the generated SDK methods type their options param as
// `RawAxiosRequestConfig`, while the interceptors below see `AxiosRequestConfig`/`Internal...`.
// Up to axios 1.12 augmenting `AxiosRequestConfig` alone flowed into `RawAxiosRequestConfig`;
// 1.16+ decoupled them, so both must be extended explicitly or the SDK call sites stop compiling.
// Augment only `AxiosRequestConfig`, and match its exact arity. As of axios 1.16+ it is
// `AxiosRequestConfig<D = any, P = any>` (two params) — an augmentation with a different number of
// type parameters declares a *separate* interface and silently fails to merge, which is why the
// SDK call sites stopped compiling after the bump. `RawAxiosRequestConfig` (what the generated SDK
// methods take) and `InternalAxiosRequestConfig` (what the interceptors see) both resolve to
// `AxiosRequestConfig` — the former is now a type alias for it, the latter extends it — so this one
// augmentation covers every call site. Don't augment `RawAxiosRequestConfig`: it's a type alias,
// which cannot be reopened.
declare module "axios" {
  // Empty body, unused `D`/`P`, and `any` are all required here, not oversights: this interface
  // exists purely to merge into axios's own declaration, so its type parameter list must match
  // axios's `AxiosRequestConfig<D = any, P = any>` byte-for-byte (see the comment above) or the
  // merge silently creates a separate, non-merging interface instead.
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type, @typescript-eslint/no-explicit-any, unused-imports/no-unused-vars
  export interface AxiosRequestConfig<D = any, P = any> extends InnopeakRequestOptions {}
}

/**
 * Requests go to this app's OWN origin, not directly to the backend — `next.config.ts` rewrites
 * `/v1/*` through to the API. That indirection is what keeps the auth cookies first-party: a
 * cookie the backend sets on a different host is invisible to this one, so the edge middleware in
 * `proxy.ts` could never see a session and would redirect every signed-in visitor to /login.
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
 * In-flight refresh, shared by every caller that hits a 401 at the same time.
 *
 * Load-bearing, not an optimization: the backend rotates refresh tokens strictly single-use, so
 * two concurrent refreshes would race and one would be rejected. Funnelling them into one promise
 * means N concurrent 401s produce exactly one rotation.
 *
 * Only within one JS context, though — it is a module-level variable, so a second tab holds its
 * own. `doRefresh` handles that case instead.
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
    // The httpOnly `access_token`/`refresh_token` cookies are already set by the time this
    // resolves — nothing in the body needs to be stored to authenticate future requests. `name` is
    // the one exception: the one path a Google sign-in (redirect-only, no JSON body ever reaches
    // this app) has for getting its display name at all — `useAuthToken` calls this the moment the
    // session cookie says signed-in but nothing is cached yet, and `/v1/auth/refresh`'s response
    // carries `user.name` same as every other token-issuing endpoint.
    const name = response.data.data?.user?.name;
    if (name) TokenService.setName(name);
    return { ok: true };
  } catch (error) {
    // The response interceptor below has already turned this into an ApiError. A transport
    // failure with no response carries status 0.
    return { ok: false, status: error instanceof ApiError ? error.statusCode : 0 };
  }
}

async function doRefresh(): Promise<boolean> {
  refreshInFlight ??= (async (): Promise<boolean> => {
    const first = await attemptRefresh();
    if (first.ok) return true;

    // `refreshInFlight` only dedupes within one JS context, so it cannot stop two tabs waking
    // from the same idle period from rotating at once. Refresh tokens are single-use: the backend
    // serves the winner and answers the loser 401, deliberately leaving the loser's cookies
    // intact because the successor it just issued is sitting in the shared cookie jar
    // (`RefreshTokenSupersededException`). That 401 is intentionally byte-identical to a dead
    // session's, so asking again is the only way to tell them apart — the race loser's second
    // attempt presents the successor and succeeds, a dead session fails twice. Skipping this made
    // the loser clear a live session and bounce its tab through /login.
    //
    // Only a 401 earns the retry. `POST /v1/auth/refresh` is throttled to 20/min per IP, so
    // retrying a 429 would spend the next slot making the same rejection twice, and retrying a
    // 5xx or a dropped connection adds load to something already failing — none of those are the
    // lost-race signature.
    if (first.status !== 401) return false;

    // Guarded on having *some* session hint: a browser that was never signed in here cannot have
    // lost a race, and retrying for it would double every anonymous visitor's cost against that
    // same throttle, which real sessions share.
    if (!TokenService.hasSession()) return false;

    return (await attemptRefresh()).ok;
  })();

  try {
    return await refreshInFlight;
  } finally {
    refreshInFlight = null;
  }
}

/** Refreshes the access token from the httpOnly refresh cookie. Exposed for callers that want to revive a session up front rather than waiting on a 401 (`useAuthToken`, `AuthService.refreshAccessToken`). */
export function refreshSession(): Promise<boolean> {
  return doRefresh();
}

let installed = false;

/**
 * Installs the request/response interceptors on the global axios instance exactly once. Called
 * automatically below, at module load, rather than from a root provider component: every
 * `api-sdk/*.ts` file imports `apiConfig` from this module, so the first SDK call anywhere already
 * guarantees this has run. Safe to evaluate during SSR too — there is no request happening yet for
 * these interceptors to act on until a real browser request comes through them.
 */
function installApiInterceptors(): void {
  if (installed) return;
  installed = true;

  axios.interceptors.response.use(
    (response) => response,
    async (error: AxiosError) => {
      const config = error.config as
        (InternalAxiosRequestConfig & { _retried?: boolean }) | undefined;

      // A 401 on an authenticated call means the 15-minute access token lapsed, not that the
      // session is over — the refresh cookie outlives it by 7 days. Refresh once and replay the
      // request, so an idle user never sees a spurious failure. `_retried` guards against ever
      // looping twice on the same request even if the caller's own retry logic layers on top.
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
        // Only the cached display name is left to clear — which principal a session belongs to is
        // read straight off the `session` cookie (`TokenService.getTokenType`), which the backend
        // clears itself once there is truly nothing left to refresh. A platform admin has no
        // refresh token at all (see `TokenService.signPlatformAdminAccessToken` on the backend), so
        // this path is exactly what their 15-minute session expiry runs through.
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
