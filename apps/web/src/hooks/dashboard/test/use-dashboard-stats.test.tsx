import { QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, test, vi } from "vitest";

import {
  type ConnectedLocation,
  ConnectionService,
  type ConnectionState,
} from "@/app/_libs/services/connection.service";
import { DashboardService } from "@/app/_libs/services/dashboard.service";
import { createQueryClient } from "@/app/_libs/utils/query-client";

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

  /**
   * Regression: neither query was gated on `["connection"]` settling, and a null `locationId`
   * means "every location this tenant has" to the API — not "not scoped yet". So the first paint
   * of a multi-location dashboard showed the summed figures across every store, then replaced
   * them with the active store's once the connection resolved and the key changed. Two requests,
   * and the first one's numbers were wrong rather than merely stale.
   */
  test("fires no request until the active location is known", async () => {
    let resolveConnection: (state: ConnectionState) => void = () => undefined;
    vi.spyOn(ConnectionService, "getState").mockReturnValue(
      new Promise<ConnectionState>((resolve) => {
        resolveConnection = resolve;
      }),
    );
    const getMetrics = vi.spyOn(DashboardService, "getMetrics").mockResolvedValue({
      total: 0,
      avgRating: null,
      pending: 0,
      escalated: 0,
      ratingDistribution: {},
    });
    const getAttentionReviews = vi
      .spyOn(DashboardService, "getAttentionReviews")
      .mockResolvedValue([]);

    const { wrapper } = renderWithClient();
    const { result } = renderHook(() => useDashboardStats("30d"), { wrapper });

    // Still resolving the connection: nothing may have gone out yet, and the screen must read as
    // loading rather than as an empty dashboard (a disabled query reports `isLoading: false`).
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
    const getMetrics = vi.spyOn(DashboardService, "getMetrics").mockResolvedValue({
      total: 0,
      avgRating: null,
      pending: 0,
      escalated: 0,
      ratingDistribution: {},
    });
    const getAttentionReviews = vi
      .spyOn(DashboardService, "getAttentionReviews")
      .mockResolvedValue([]);

    const { wrapper } = renderWithClient();
    renderHook(() => useDashboardStats("30d"), { wrapper });

    await waitFor(() => expect(getMetrics).toHaveBeenCalledWith("30d", "loc-1"));
    expect(getAttentionReviews).toHaveBeenCalledWith(4, "loc-1");
  });

  test("aggregates across every location when nothing is active yet", async () => {
    vi.spyOn(ConnectionService, "getState").mockResolvedValue(
      connectionState({ location: null }),
    );
    const getMetrics = vi.spyOn(DashboardService, "getMetrics").mockResolvedValue({
      total: 0,
      avgRating: null,
      pending: 0,
      escalated: 0,
      ratingDistribution: {},
    });

    const { wrapper } = renderWithClient();
    renderHook(() => useDashboardStats("7d"), { wrapper });

    await waitFor(() => expect(getMetrics).toHaveBeenCalledWith("7d", undefined));
  });

  test("switching the active location fetches fresh data under a new query key, not a stale cache hit", async () => {
    // Regression: without `locationId` in the query key, switching business would either show the
    // previous business's already-cached numbers or require a manual invalidation this hook never
    // performs — the key itself has to change for react-query to treat it as a different query.
    const getMetrics = vi.spyOn(DashboardService, "getMetrics").mockResolvedValue({
      total: 0,
      avgRating: null,
      pending: 0,
      escalated: 0,
      ratingDistribution: {},
    });
    vi.spyOn(DashboardService, "getAttentionReviews").mockResolvedValue([]);
    const getState = vi
      .spyOn(ConnectionService, "getState")
      .mockResolvedValue(connectionState({ location: location({ id: "loc-1" }) }));

    const { wrapper, queryClient } = renderWithClient();
    const { rerender } = renderHook(() => useDashboardStats("30d"), { wrapper });

    await waitFor(() => expect(getMetrics).toHaveBeenCalledWith("30d", "loc-1"));

    // Simulate the Business Switcher's own mutation success handler — a direct write into the
    // shared `["connection"]` cache, exactly what `useBusinessSwitcher` does.
    getState.mockResolvedValue(connectionState({ location: location({ id: "loc-2" }) }));
    queryClient.setQueryData(["connection"], connectionState({ location: location({ id: "loc-2" }) }));
    rerender();

    await waitFor(() => expect(getMetrics).toHaveBeenCalledWith("30d", "loc-2"));
  });
});
