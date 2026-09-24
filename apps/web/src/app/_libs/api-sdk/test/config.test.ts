import { beforeEach, describe, expect, test, vi } from "vitest";

const post = vi.fn();
const requestUse = vi.fn();

// The module installs interceptors on the global axios at import time, so the mock has to carry
// an `interceptors` shape as well as `post`. `requestUse` is captured so the request interceptor
// can be invoked directly below. `defaults` is required too on this branch — see the mock adapter
// comment in `../config`'s own `installApiInterceptors` — which assigns `axios.defaults.adapter`
// unconditionally at import time.
vi.mock("axios", () => {
  const instance = {
    post,
    defaults: {} as { adapter?: unknown },
    interceptors: {
      request: { use: requestUse },
      response: { use: vi.fn() },
    },
  };
  return { __esModule: true, default: instance };
});

const { refreshSession } = await import("../config");
const { TokenService } = await import("@/app/_libs/services/token.service");
const { ApiError } = await import("@/app/_libs/services/api-error");

const ok = { data: { data: { accessToken: "rotated-access-token" } } };

/** The real thing the response interceptor would have thrown. */
const apiError = (status: number) => new ApiError(status, `failed with ${status}`);

beforeEach(() => {
  post.mockReset();
  window.localStorage.clear();
});

describe("refreshSession", () => {
  test("makes exactly one request when the first attempt succeeds", async () => {
    post.mockResolvedValueOnce(ok);

    await expect(refreshSession()).resolves.toBe(true);
    expect(post).toHaveBeenCalledTimes(1);
    expect(TokenService.getStoredAccessToken()).toBe("rotated-access-token");
  });

  /**
   * The concurrent-rotation case. Refresh tokens are single-use, so when two tabs wake from the
   * same idle period the backend serves one and 401s the other while deliberately leaving the
   * loser's cookies intact — its 401 is byte-identical to a dead session's. Retrying is the only
   * way to tell them apart, and the loser's second attempt presents the successor the winner just
   * issued. Without the retry the loser cleared a live session and bounced its tab through /login.
   */
  test("retries once and recovers when the first attempt loses a rotation race", async () => {
    TokenService.setAccessToken("stale-but-present");
    post.mockRejectedValueOnce(apiError(401));
    post.mockResolvedValueOnce(ok);

    await expect(refreshSession()).resolves.toBe(true);
    expect(post).toHaveBeenCalledTimes(2);
    expect(TokenService.getStoredAccessToken()).toBe("rotated-access-token");
  });

  test("gives up after the retry when the session is genuinely gone", async () => {
    TokenService.setAccessToken("stale-but-present");
    post.mockRejectedValue(apiError(401));

    await expect(refreshSession()).resolves.toBe(false);
    expect(post).toHaveBeenCalledTimes(2);
  });

  /**
   * An anonymous visitor has nothing stored *because they are anonymous*, so they cannot have lost
   * a race. Retrying for them would double every landing-page view's cost against the per-IP
   * refresh throttle that real sessions share.
   */
  test("does not retry when no token was ever stored", async () => {
    post.mockRejectedValue(apiError(401));

    await expect(refreshSession()).resolves.toBe(false);
    expect(post).toHaveBeenCalledTimes(1);
  });

  /**
   * Only a 401 is the lost-race signature. `POST /v1/auth/refresh` is throttled to 20/min per IP,
   * so retrying a 429 spends the next slot re-earning the same rejection; a 5xx or a dropped
   * connection means the thing is already unwell.
   */
  test.each([
    ["429 (throttled)", 429],
    ["500 (server error)", 500],
    ["0 (transport failure, no response)", 0],
  ])("does not retry on %s", async (_label, status) => {
    TokenService.setAccessToken("stale-but-present");
    post.mockRejectedValue(apiError(status));

    await expect(refreshSession()).resolves.toBe(false);
    expect(post).toHaveBeenCalledTimes(1);
  });

  test("is single-flight: concurrent callers share one rotation", async () => {
    post.mockResolvedValueOnce(ok);

    const [first, second] = await Promise.all([refreshSession(), refreshSession()]);

    expect(first).toBe(true);
    expect(second).toBe(true);
    expect(post).toHaveBeenCalledTimes(1);
  });
});

/**
 * The interceptors are installed on the *global* axios instance, so they apply to every request
 * made through the default export — not just SDK calls. The token must not ride along to a
 * foreign origin.
 */
describe("request interceptor: token is only attached to our own origin", () => {
  const attach = (config: { url?: string; baseURL?: string; authOptional?: boolean }) => {
    const set = vi.fn();
    const interceptor = requestUse.mock.calls[0]?.[0] as (c: unknown) => unknown;
    interceptor({ ...config, headers: { set } });
    return set.mock.calls.some(([header]) => header === "Authorization");
  };

  // Must be a real JWT shape with a future `exp`: `getAccessToken()` returns null for anything
  // it cannot decode, which would make every case below trivially "not attached".
  const unexpiredJwt = `header.${btoa(
    JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600 }),
  )}.signature`;

  beforeEach(() => {
    TokenService.setAccessToken(unexpiredJwt);
  });

  test("attaches to a relative SDK path", () => {
    expect(attach({ url: "/v1/reviews" })).toBe(true);
  });

  test("attaches to an absolute URL on our own origin", () => {
    expect(attach({ url: `${window.location.origin}/v1/reviews` })).toBe(true);
  });

  test("does NOT attach to an absolute third-party URL", () => {
    expect(attach({ url: "https://evil.example.com/collect" })).toBe(false);
  });

  test("does NOT attach when a foreign baseURL is combined with a relative url", () => {
    expect(attach({ url: "/v1/reviews", baseURL: "https://evil.example.com" })).toBe(false);
  });

  test("does NOT attach when authOptional is set, even on our own origin", () => {
    expect(attach({ url: "/v1/auth/login", authOptional: true })).toBe(false);
  });
});
