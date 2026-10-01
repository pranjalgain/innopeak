import { beforeEach, describe, expect, test, vi } from "vitest";

const post = vi.fn();

// The module installs interceptors on the global axios at import time, so the mock has to carry
// an `interceptors` shape even though nothing here inspects the request interceptor anymore.
vi.mock("axios", () => {
  const instance = {
    post,
    interceptors: {
      request: { use: vi.fn() },
      response: { use: vi.fn() },
    },
  };
  return { __esModule: true, default: instance };
});

const { refreshSession } = await import("../config");
const { TokenService } = await import("@/app/_libs/services/token.service");
const { ApiError } = await import("@/app/_libs/services/api-error");

/**
 * `TokenService.getTokenType()`/`hasSession()` read the non-credential `session` cookie the
 * backend sets on every sign-in — seeding it directly here is the jsdom equivalent of the
 * backend's `res.cookie("session", ...)`.
 */
function setSessionCookie(value: "tenant" | "admin" | null): void {
  document.cookie =
    value === null
      ? "session=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/"
      : `session=${value}; path=/`;
}

// The httpOnly access/refresh cookies this response also sets are invisible to this test (as they
// would be to the real browser) — only `user.name` is ever read out of the body, the one thing a
// Google sign-in has no other way to get. See `attemptRefresh`'s own doc comment.
const ok = { data: { data: { user: { name: "Jane Doe" } } } };

/** The real thing the response interceptor would have thrown. */
const apiError = (status: number) => new ApiError(status, `failed with ${status}`);

beforeEach(() => {
  post.mockReset();
  window.localStorage.clear();
  setSessionCookie(null);
});

describe("refreshSession", () => {
  test("makes exactly one request when the first attempt succeeds", async () => {
    post.mockResolvedValueOnce(ok);

    await expect(refreshSession()).resolves.toBe(true);
    expect(post).toHaveBeenCalledTimes(1);
    expect(TokenService.getName()).toBe("Jane Doe");
  });

  /**
   * The concurrent-rotation case. Refresh tokens are single-use, so when two tabs wake from the
   * same idle period the backend serves one and 401s the other while deliberately leaving the
   * loser's cookies intact — its 401 is byte-identical to a dead session's. Retrying is the only
   * way to tell them apart, and the loser's second attempt presents the successor the winner just
   * issued. Without the retry the loser cleared a live session and bounced its tab through /login.
   */
  test("retries once and recovers when the first attempt loses a rotation race", async () => {
    setSessionCookie("tenant");
    post.mockRejectedValueOnce(apiError(401));
    post.mockResolvedValueOnce(ok);

    await expect(refreshSession()).resolves.toBe(true);
    expect(post).toHaveBeenCalledTimes(2);
    expect(TokenService.getName()).toBe("Jane Doe");
  });

  test("gives up after the retry when the session is genuinely gone", async () => {
    setSessionCookie("tenant");
    post.mockRejectedValue(apiError(401));

    await expect(refreshSession()).resolves.toBe(false);
    expect(post).toHaveBeenCalledTimes(2);
  });

  /**
   * An anonymous visitor has no session hint *because they are anonymous*, so they cannot have
   * lost a race. Retrying for them would double every landing-page view's cost against the per-IP
   * refresh throttle that real sessions share.
   */
  test("does not retry when there was never a session", async () => {
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
    setSessionCookie("tenant");
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
