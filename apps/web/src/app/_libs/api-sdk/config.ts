import { Configuration } from "@innopeak/client-sdk";
import axios, { type AxiosError, type InternalAxiosRequestConfig } from "axios";

import { ApiError } from "@/app/_libs/services/api-error";
import { TokenService } from "@/app/_libs/services/token.service";
import { signInPathFor } from "@/app/_libs/utils/post-login-redirect";
import { sessionMessage } from "@/app/_libs/utils/session-messages";

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
let refreshInFlight: Promise<RefreshAttempt> | null = null;

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

async function doRefresh(): Promise<RefreshAttempt> {
  refreshInFlight ??= (async (): Promise<RefreshAttempt> => {
    const first = await attemptRefresh();
    if (first.ok) return first;

    // `refreshInFlight` only dedupes within one JS context, so two tabs waking from idle can rotate at once. Refresh tokens
    // are single-use: the backend serves the winner and 401s the loser, leaving its cookies intact
    // (`RefreshTokenSupersededException`), a 401 byte-identical to a dead session's. Asking again is the only way to tell
    // them apart (the loser's second attempt presents the successor); skipping it cleared live sessions and bounced tabs through /login.
    // Only a 401 earns the retry: retrying a 429 (refresh is throttled to 20/min per IP) or a 5xx only adds load.
    if (first.status !== 401) return first;

    // A browser never signed in here cannot have lost a race; retrying would double every anonymous visitor's cost against the shared throttle.
    if (!TokenService.hasSession()) return first;

    return attemptRefresh();
  })();

  try {
    return await refreshInFlight;
  } finally {
    refreshInFlight = null;
  }
}

/** Exposed so callers can revive a session up front rather than waiting on a 401. */
export async function refreshSession(): Promise<boolean> {
  return (await doRefresh()).ok;
}

/**
 * `refreshSession` with the reason it failed. A caller that must tell "the session is over" (401) from "try again" (429, a 5xx, no
 * network) needs the status: only the first is a reason to leave the page.
 */
export async function refreshSessionOutcome(): Promise<RefreshAttempt> {
  return doRefresh();
}

/** Set once a lapsed session has started the sign-in redirect, so the page's other in-flight 401s don't each navigate. */
let leavingLapsedSession = false;

/**
 * The session is over (refresh failed) and the page is still open on guarded content: its requests now all 401 and it would sit
 * on error states until the next navigation. Go to the sign-in screen instead, with a way back to this page.
 */
function leaveLapsedSession(kind: "tenant" | "admin"): void {
  if (typeof window === "undefined" || leavingLapsedSession) return;
  const target = signInPathFor(kind, window.location.pathname, window.location.search);
  if (!target) return;
  leavingLapsedSession = true;
  window.location.assign(target);
}

/**
 * The refresh answered 401: the session is really over. Forgets the cached identity and goes to sign-in, back to this page afterwards. The
 * interceptor does the same for a request that 401s and cannot be revived.
 */
export function endLapsedSession(): void {
  const sessionKind = TokenService.getTokenType();
  TokenService.clear();
  if (sessionKind) {
    leaveLapsedSession(sessionKind === "platform_admin" ? "admin" : "tenant");
  }
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
        // Read before the refresh: a failed one has the backend clear the `session` cookie this comes from.
        const sessionKind = TokenService.getTokenType();
        const refresh = await doRefresh();

        if (refresh.ok) {
          config._retried = true;
          return axios(config);
        }
        // Only a 401 means the session is over: that is the one answer for which the backend clears the `session` cookie. A 429, a
        // 5xx or a dropped connection leaves the cookie, so the proxy would send `/login` straight back to this page and the two
        // would loop until the refresh got through. Those fall through as the request's own error, and the next call tries again.
        if (refresh.status === 401) {
          // Only the cached display name needs clearing: the principal is read off the `session` cookie, which the backend
          // clears itself. A platform admin has no refresh token, so their 15-minute expiry runs through here.
          TokenService.clear();
          if (sessionKind) {
            leaveLapsedSession(sessionKind === "platform_admin" ? "admin" : "tenant");
          }
        } else {
          // Answered as what happened, not as the original 401: callers treat a 401 as "the interceptor is already redirecting" and show
          // nothing, which left a throttled or unreachable refresh looking like an empty, successful load.
          throw new ApiError(
            refresh.status === 0 ? 503 : refresh.status,
            sessionMessage("refreshFailed"),
            "SESSION_REFRESH_FAILED",
          );
        }
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
