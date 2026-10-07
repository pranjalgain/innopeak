import { QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { ROUTES } from "@/app/_libs/constants/routes";
import { ApiError } from "@/app/_libs/services/api-error";
import { ConnectionService, type ConnectionState } from "@/app/_libs/services/connection.service";
import { TenantOwnerProfileService } from "@/app/_libs/services/tenant-owner-profile.service";
import { createQueryClient } from "@/app/_libs/utils/query-client";
import { connectionQueryKey } from "@/hooks/connections/use-connection";
import { tenantOwnerProfileQueryKey } from "@/hooks/settings/use-tenant-owner-profile";
import type { TenantOwnerProfile } from "@/types/domain";

import messages from "../../../../../messages/en.json";
import { ConnectionGuard } from "../connection-guard";

const replace = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace }),
}));

function state(overrides: Partial<ConnectionState> = {}): ConnectionState {
  return {
    status: "connected",
    connectionId: "conn-1",
    providerAccountId: "accounts/1",
    connectedAt: "2026-01-01T00:00:00.000Z",
    location: null,
    ...overrides,
  };
}

function profile(overrides: Partial<TenantOwnerProfile> = {}): TenantOwnerProfile {
  return {
    name: "Maria Delgado",
    email: "maria@coastaltable.com",
    avatarUrl: null,
    hasPassword: true,
    businessName: "The Coastal Table",
    role: "owner",
    ...overrides,
  };
}

function renderGuard(queryClient: ReturnType<typeof createQueryClient> = createQueryClient()) {
  // Fresh QueryClient per render so cached `["connection"]` data can't leak between tests.
  return render(
    <QueryClientProvider client={queryClient}>
      <NextIntlClientProvider locale="en" messages={messages}>
        <ConnectionGuard>
          <p>Dashboard content</p>
        </ConnectionGuard>
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

describe("ConnectionGuard", () => {
  beforeEach(() => {
    replace.mockClear();
    vi.restoreAllMocks();
    // Default owner profile; otherwise `useTenantOwnerProfile()` would hit the real `AuthService.me()`.
    vi.spyOn(TenantOwnerProfileService, "get").mockResolvedValue(profile());
  });

  test("renders the dashboard for a connected tenant", async () => {
    vi.spyOn(ConnectionService, "getState").mockResolvedValue(state());

    renderGuard();

    expect(await screen.findByText("Dashboard content")).toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
  });

  test("redirects a disconnected owner to onboarding", async () => {
    vi.spyOn(ConnectionService, "getState").mockResolvedValue(state({ status: "disconnected" }));
    const queryClient = createQueryClient();
    queryClient.setQueryData(tenantOwnerProfileQueryKey, profile({ role: "owner" }));

    renderGuard(queryClient);

    await waitFor(() => expect(replace).toHaveBeenCalledWith(ROUTES.ONBOARDING_CONNECT));
    expect(screen.queryByText("Dashboard content")).not.toBeInTheDocument();
  });

  // Regression: members were sent to the owner-only connect stepper, where no button could succeed.
  test("shows a member a waiting screen instead of the onboarding stepper when disconnected", async () => {
    vi.spyOn(ConnectionService, "getState").mockResolvedValue(state({ status: "disconnected" }));
    const queryClient = createQueryClient();
    queryClient.setQueryData(tenantOwnerProfileQueryKey, profile({ role: "member" }));

    renderGuard(queryClient);

    expect(await screen.findByText("Almost there")).toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
    expect(screen.queryByText("Dashboard content")).not.toBeInTheDocument();
  });

  test("does not redirect a disconnected tenant before the caller's role is known", () => {
    // `isMember` is false while `profile` loads; the decision must wait, not assume owner.
    vi.spyOn(ConnectionService, "getState").mockResolvedValue(state({ status: "disconnected" }));
    vi.spyOn(TenantOwnerProfileService, "get").mockReturnValue(new Promise(() => undefined));

    renderGuard();

    expect(replace).not.toHaveBeenCalled();
    expect(screen.queryByText("Dashboard content")).not.toBeInTheDocument();
    expect(screen.queryByText("Almost there")).not.toBeInTheDocument();
  });

  test("renders the dashboard with a reconnect banner when the grant expired", async () => {
    // Blanking the dashboard over an expired refresh token reads as data loss; only new-review ingestion is broken.
    vi.spyOn(ConnectionService, "getState").mockResolvedValue(state({ status: "needs_reauth" }));

    renderGuard();

    expect(await screen.findByText("Dashboard content")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reconnect" })).toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
  });

  test("fails open on a server error rather than ejecting the user into onboarding", async () => {
    // A transient 5xx must not look like "you never connected"; a 401 is handled upstream, so failing open can't mask it.
    vi.spyOn(ConnectionService, "getState").mockRejectedValue(new ApiError(503, "Unavailable"));

    renderGuard();

    expect(await screen.findByText("Dashboard content")).toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
  });

  // Regression: a 403 (non-tenant token) fell through every branch and silently rendered an empty dashboard shell; retrying can never succeed, so it must not fail open.
  test("does not fail open on a 403 — sends the caller to /forbidden instead", async () => {
    const originalLocation = window.location;
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { ...originalLocation, href: "http://localhost:3002/dashboard" },
    });

    vi.spyOn(ConnectionService, "getState").mockRejectedValue(new ApiError(403, "Forbidden"));

    renderGuard();

    await waitFor(() => expect(window.location.href).toBe(ROUTES.FORBIDDEN));
    expect(screen.queryByText("Dashboard content")).not.toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();

    Object.defineProperty(window, "location", { configurable: true, value: originalLocation });
  });

  test("fails open on a network failure", async () => {
    vi.spyOn(ConnectionService, "getState").mockRejectedValue(new TypeError("Failed to fetch"));

    renderGuard();

    expect(await screen.findByText("Dashboard content")).toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
  });

  test("shows a skeleton, not the dashboard, while the check is in flight", () => {
    vi.spyOn(ConnectionService, "getState").mockReturnValue(new Promise(() => undefined));

    renderGuard();

    expect(screen.queryByText("Dashboard content")).not.toBeInTheDocument();
  });

  test("keeps rendering the dashboard through a background refetch, not just the first load", async () => {
    // Regression: `["connection"]` is shared app-wide, so a second observer or `refetchOnReconnect` must not blank a connected dashboard back to a skeleton.
    const queryClient = createQueryClient();
    queryClient.setQueryData(connectionQueryKey, state());
    const getState = vi.spyOn(ConnectionService, "getState");
    getState.mockReturnValue(new Promise(() => undefined));

    renderGuard(queryClient);

    expect(await screen.findByText("Dashboard content")).toBeInTheDocument();

    // Not awaited: the mocked `getState` never resolves, so awaiting `invalidateQueries` would hang.
    void queryClient.invalidateQueries({ queryKey: connectionQueryKey });
    await waitFor(() => expect(getState).toHaveBeenCalled());

    expect(screen.getByText("Dashboard content")).toBeInTheDocument();
  });
});
