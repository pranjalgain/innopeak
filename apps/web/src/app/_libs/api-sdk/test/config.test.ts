import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const post = vi.fn();
const responseUse = vi.fn();

// The module installs interceptors on the global axios at import time, so the mock must carry an `interceptors` shape.
vi.mock("axios", () => {
  const instance = {
    post,
    interceptors: {
      request: { use: vi.fn() },
      response: { use: responseUse },
    },
  };
  return { __esModule: true, default: instance };
});

const { refreshSession } = await import("../config");
const { TokenService } = await import("@/app/_libs/services/token.service");
const { ApiError } = await import("@/app/_libs/services/api-error");

/** Seeds the non-credential `session` cookie the backend sets on sign-in, which `TokenService.getTokenType()`/`hasSession()` read. */
function setSessionCookie(value: "tenant" | "admin" | null): void {
  document.cookie =
    value === null
      ? "session=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/"
      : `session=${value}; path=/`;
}

// Only `user.name` is read from the body (a Google sign-in has no other way to get it); the httpOnly cookies are invisible here.
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

  // Regression: the loser of a two-tab refresh race (backend 401s it, byte-identical to a dead session's) cleared a
  // live session; its retry presents the successor the winner issued and succeeds.
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

  // An anonymous visitor cannot have lost a race; retrying would double their cost against the shared per-IP refresh throttle.
  test("does not retry when there was never a session", async () => {
    post.mockRejectedValue(apiError(401));

    await expect(refreshSession()).resolves.toBe(false);
    expect(post).toHaveBeenCalledTimes(1);
  });

  // Only a 401 is the lost-race signature; retrying a 429 (throttle) or a 5xx just adds load.
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

describe("a 401 that cannot be refreshed", () => {
  const assign = vi.fn();
  const original = window.location;

  function openPage(pathname: string, search = ""): void {
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { pathname, search, assign },
    });
  }

  /** The flag that stops repeat redirects lives for one page load, so each call gets a freshly loaded module. */
  async function failWith401(refreshStatus = 401): Promise<unknown> {
    responseUse.mockClear();
    vi.resetModules();
    await import("../config");
    // `instanceof ApiError` in the module under test needs the class from the same, freshly reset, module registry.
    const { ApiError: FreshApiError } = await import("@/app/_libs/services/api-error");
    post.mockRejectedValue(new FreshApiError(refreshStatus, `failed with ${refreshStatus}`));
    const rejected = responseUse.mock.calls[0]?.[1] as (error: unknown) => Promise<unknown>;
    return rejected({ response: { status: 401, data: {} }, config: {}, message: "Unauthorized" }).catch(
      (error: unknown) => error,
    );
  }

  beforeEach(() => {
    assign.mockReset();
  });

  afterEach(() => {
    Object.defineProperty(window, "location", { configurable: true, value: original });
  });

  // Regression: a revoked session left the open page on "Couldn't load…" states until the next navigation.
  test("sends a signed-in visitor on a guarded page to sign in, remembering the page", async () => {
    setSessionCookie("tenant");
    openPage("/review-queue", "?status=new");

    expect(await failWith401()).toMatchObject({ statusCode: 401 });
    expect(assign).toHaveBeenCalledWith("/login?next=%2Freview-queue%3Fstatus%3Dnew");
  });

  // Regression: a 429 or 5xx refresh leaves the `session` cookie, so the proxy bounced /login back to the page and the two looped.
  test.each([429, 502, 0])("does not leave the page when the refresh failed with %i rather than a 401", async (status) => {
    setSessionCookie("tenant");
    openPage("/dashboard");

    // Answered as what happened (throttled, unavailable), not as the original 401: a 401 reads as "already redirecting" and is hidden.
    expect(await failWith401(status)).toMatchObject({
      statusCode: status === 0 ? 503 : status,
      errorCode: "SESSION_REFRESH_FAILED",
    });
    expect(assign).not.toHaveBeenCalled();
  });

  test("sends an admin to the admin sign-in", async () => {
    setSessionCookie("admin");
    openPage("/admin/users");

    await failWith401();
    expect(assign).toHaveBeenCalledWith("/admin-login?next=%2Fadmin%2Fusers");
  });

  test("leaves a visitor with no session, or on an unguarded page, where they are", async () => {
    openPage("/review-queue");
    await failWith401();

    setSessionCookie("tenant");
    openPage("/onboarding/connect");
    await failWith401();

    expect(assign).not.toHaveBeenCalled();
  });
});
