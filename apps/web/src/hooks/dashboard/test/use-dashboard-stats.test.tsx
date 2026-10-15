import { focusManager, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import {
  type ConnectedLocation,
  ConnectionService,
  type ConnectionState,
} from "@/app/_libs/services/connection.service";
import { DashboardService } from "@/app/_libs/services/dashboard.service";
import { createQueryClient } from "@/app/_libs/utils/query-client";
import type { DashboardMetrics } from "@/types/domain";

import { useDashboardStats } from "../use-dashboard-stats";

function location(overrides: Partial<ConnectedLocation> = {}): ConnectedLocation {
  return {
    id: "loc-1",
    provider: "google",
    externalLocationId: "locations/1",
    businessName: "Downtown Store",
    address: null,
    status: "active",
    lastSyncedAt: null,
    lastSyncStatus: null,
    lastSyncError: null,
    onboardingBackfillCompletedAt: "2026-01-01T00:00:00.000Z",
    billingPausedAt: null,
    ...overrides,
  };
}

function connectionState(overrides: Partial<ConnectionState> = {}): ConnectionState {
  return {
    status: "connected",
    connectionId: "conn-1",
    providerAccountId: "accounts/1",
    connectedAt: "2026-01-01T00:00:00.000Z",
    location: location(),
    ...overrides,
  };
}

function metrics(overrides: Partial<DashboardMetrics> = {}): DashboardMetrics {
  return {
    stats: {
      range: "30d",
      reviewCount: 0,
      averageRating: 0,
      pendingApproval: 0,
      escalatedOpen: 0,
    },
    ratingDistribution: [],
    ...overrides,
  };
}

function renderWithClient() {
  const queryClient = createQueryClient();
  function wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  }
  return { queryClient, wrapper };
}

describe("useDashboardStats — location scoping", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  /** Regression: ungated queries with a null `locationId` (= all locations) flashed summed figures before the active store's loaded. */
  test("fires no request until the active location is known", async () => {
    let resolveConnection: (state: ConnectionState) => void = () => undefined;
    vi.spyOn(ConnectionService, "getState").mockReturnValue(
      new Promise<ConnectionState>((resolve) => {
        resolveConnection = resolve;
      }),
    );
    const getMetrics = vi.spyOn(DashboardService, "getMetrics").mockResolvedValue(metrics());
    const getAttentionReviews = vi
      .spyOn(DashboardService, "getAttentionReviews")
      .mockResolvedValue([]);

    const { wrapper } = renderWithClient();
    const { result } = renderHook(() => useDashboardStats("30d"), { wrapper });

    // Connection still resolving: nothing sent, yet it must read as loading (a disabled query reports `isLoading: false`).
    expect(getMetrics).not.toHaveBeenCalled();
    expect(getAttentionReviews).not.toHaveBeenCalled();
    expect(result.current.isLoading).toBe(true);

    resolveConnection(connectionState({ location: location({ id: "loc-1" }) }));

    await waitFor(() => expect(getMetrics).toHaveBeenCalledWith("30d", "loc-1"));
    expect(getMetrics).toHaveBeenCalledTimes(1);
  });

  test("passes the active location's id to both dashboard calls", async () => {
    vi.spyOn(ConnectionService, "getState").mockResolvedValue(
      connectionState({ location: location({ id: "loc-1" }) }),
    );
    const getMetrics = vi.spyOn(DashboardService, "getMetrics").mockResolvedValue(metrics());
    const getAttentionReviews = vi
      .spyOn(DashboardService, "getAttentionReviews")
      .mockResolvedValue([]);

    const { wrapper } = renderWithClient();
    renderHook(() => useDashboardStats("30d"), { wrapper });

    await waitFor(() => expect(getMetrics).toHaveBeenCalledWith("30d", "loc-1"));
    expect(getAttentionReviews).toHaveBeenCalledWith(3, "loc-1");
  });

  test("aggregates across every location when nothing is active yet", async () => {
    vi.spyOn(ConnectionService, "getState").mockResolvedValue(
      connectionState({ location: null }),
    );
    const getMetrics = vi.spyOn(DashboardService, "getMetrics").mockResolvedValue(metrics());

    const { wrapper } = renderWithClient();
    renderHook(() => useDashboardStats("7d"), { wrapper });

    await waitFor(() => expect(getMetrics).toHaveBeenCalledWith("7d", undefined));
  });

  test("switching the active location fetches fresh data under a new query key, not a stale cache hit", async () => {
    // Regression: without `locationId` in the key, switching business would show the previous business's cached numbers.
    const getMetrics = vi.spyOn(DashboardService, "getMetrics").mockResolvedValue(metrics());
    vi.spyOn(DashboardService, "getAttentionReviews").mockResolvedValue([]);
    const getState = vi
      .spyOn(ConnectionService, "getState")
      .mockResolvedValue(connectionState({ location: location({ id: "loc-1" }) }));

    const { wrapper, queryClient } = renderWithClient();
    const { rerender } = renderHook(() => useDashboardStats("30d"), { wrapper });

    await waitFor(() => expect(getMetrics).toHaveBeenCalledWith("30d", "loc-1"));

    // Simulates `useBusinessSwitcher`'s success handler writing to the shared `["connection"]` cache.
    getState.mockResolvedValue(connectionState({ location: location({ id: "loc-2" }) }));
    queryClient.setQueryData(["connection"], connectionState({ location: location({ id: "loc-2" }) }));
    rerender();

    await waitFor(() => expect(getMetrics).toHaveBeenCalledWith("30d", "loc-2"));
  });
});

/** Figures change on the server without the user doing anything, so the screen refreshes itself when the window is focused again. */
describe("useDashboardStats — staying current", () => {
  const T0 = new Date("2026-06-01T10:00:00Z").getTime();
  const returnToWindow = () => {
    act(() => {
      focusManager.setFocused(false);
      focusManager.setFocused(true);
    });
  };

  beforeEach(() => {
    vi.restoreAllMocks();
    // Only the clock: `waitFor` and the query machinery need real timers.
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(T0);
    vi.spyOn(ConnectionService, "getState").mockResolvedValue(connectionState());
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test("does not refetch when the window is refocused within a minute", async () => {
    const getMetrics = vi.spyOn(DashboardService, "getMetrics").mockResolvedValue(metrics());
    vi.spyOn(DashboardService, "getAttentionReviews").mockResolvedValue([]);
    const { wrapper } = renderWithClient();
    renderHook(() => useDashboardStats("30d"), { wrapper });
    await waitFor(() => expect(getMetrics).toHaveBeenCalledTimes(1));

    vi.setSystemTime(T0 + 30_000);
    returnToWindow();

    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(getMetrics).toHaveBeenCalledTimes(1);
  });

  test("refetches both queries when the window is refocused after a minute", async () => {
    const getMetrics = vi.spyOn(DashboardService, "getMetrics").mockResolvedValue(metrics());
    const getAttention = vi.spyOn(DashboardService, "getAttentionReviews").mockResolvedValue([]);
    const { wrapper } = renderWithClient();
    renderHook(() => useDashboardStats("30d"), { wrapper });
    await waitFor(() => expect(getMetrics).toHaveBeenCalledTimes(1));

    vi.setSystemTime(T0 + 61_000);
    returnToWindow();

    await waitFor(() => expect(getMetrics).toHaveBeenCalledTimes(2));
    expect(getAttention).toHaveBeenCalledTimes(2);
  });

  test("keeps showing the figures when a background refresh fails", async () => {
    const getMetrics = vi
      .spyOn(DashboardService, "getMetrics")
      .mockResolvedValueOnce(metrics({ stats: { ...metrics().stats, reviewCount: 42 } }));
    vi.spyOn(DashboardService, "getAttentionReviews").mockResolvedValue([]);
    const { wrapper } = renderWithClient();
    const { result } = renderHook(() => useDashboardStats("30d"), { wrapper });
    await waitFor(() => expect(result.current.stats?.reviewCount).toBe(42));

    getMetrics.mockRejectedValue(new Error("offline"));
    vi.setSystemTime(T0 + 61_000);
    returnToWindow();
    await waitFor(() => expect(getMetrics).toHaveBeenCalledTimes(2));

    expect(result.current.stats?.reviewCount).toBe(42);
    expect(result.current.error).toBeNull();
  });
});
