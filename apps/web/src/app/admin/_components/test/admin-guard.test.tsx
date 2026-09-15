import { QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

import { SessionService } from "@/app/_libs/services/session.service";
import { TokenService } from "@/app/_libs/services/token.service";
import { createQueryClient } from "@/app/_libs/utils/query-client";

import { AdminGuard } from "../admin-guard";

const replace = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace }),
}));

// `useAuthToken` falls back to a `/v1/auth/refresh` round trip whenever localStorage holds no
// usable token. Stubbed to "no session" so the token half of the guard is decided locally and
// these tests never depend on a backend.
vi.mock("@/app/_libs/api-sdk/config", () => ({
  refreshSession: vi.fn().mockResolvedValue(false),
  apiConfig: {},
}));

/** A far-future JWT — `useAuthToken` treats an expired token as no session at all. */
function storeLiveAccessToken(): void {
  const payload = btoa(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600 }));
  TokenService.setAccessToken(`header.${payload}.signature`);
}

function renderGuard() {
  // A fresh QueryClient per render so one test's cached `["session", "role"]` can never leak into
  // the next.
  return render(
    <QueryClientProvider client={createQueryClient()}>
      <AdminGuard>
        <div>admin content</div>
      </AdminGuard>
    </QueryClientProvider>,
  );
}

describe("AdminGuard", () => {
  afterEach(() => {
    window.localStorage.clear();
    replace.mockClear();
  });

  test("redirects to /login and renders nothing when the session isn't a super admin", async () => {
    storeLiveAccessToken();

    renderGuard();

    await waitFor(() => expect(replace).toHaveBeenCalledWith("/login"));
    expect(screen.queryByText("admin content")).not.toBeInTheDocument();
  });

  /**
   * Regression: the role is only a localStorage string and the interceptor clears the *token* on a
   * dead session. A platform admin's access token lasts 15 minutes with no refresh token behind
   * it, so checking the role alone left an expired admin inside a fully-rendered admin shell where
   * every request 401'd, rather than being sent back to sign in.
   */
  test("redirects when the role says super_admin but the session token is gone", async () => {
    await SessionService.setRole("super_admin");

    renderGuard();

    await waitFor(() => expect(replace).toHaveBeenCalledWith("/login"));
    expect(screen.queryByText("admin content")).not.toBeInTheDocument();
  });

  test("renders children without redirecting for a super admin with a live session", async () => {
    await SessionService.setRole("super_admin");
    storeLiveAccessToken();

    renderGuard();

    expect(await screen.findByText("admin content")).toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
  });
});
