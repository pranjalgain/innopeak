import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import {
  type BackfillProgress,
  type ConnectedLocation,
  ConnectionService,
  type ConnectionState,
} from "@/app/_libs/services/connection.service";

import { useOnboardingConnectFlow } from "../use-onboarding-connect-flow";

const replace = vi.fn();
let searchParams = new URLSearchParams();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace }),
  usePathname: () => "/onboarding/connect",
  useSearchParams: () => searchParams,
}));

const CONNECTED_LOCATION: ConnectionState["location"] = {
  id: "loc-1",
  provider: "google",
  externalLocationId: "locations/1",
  businessName: "The Coastal Table",
  address: "214 Harbor St, Portland, ME",
  status: "active",
  lastSyncedAt: null,
  lastSyncStatus: null,
  lastSyncError: null,
  onboardingBackfillCompletedAt: null,
};

function persistedLocation(overrides: Partial<ConnectedLocation> = {}): ConnectedLocation {
  return { ...CONNECTED_LOCATION, ...overrides } as ConnectedLocation;
}

function progress(overrides: Partial<BackfillProgress> = {}): BackfillProgress {
  return {
    locationId: "loc-1",
    syncRunId: "run-1",
    status: "running",
    reviewsFetched: 5,
    totalToImport: 20,
    progress: 25,
    errorMessage: null,
    isStale: false,
    livePollingEnabled: false,
    ...overrides,
  };
}

function connectedWithBackfill(): ConnectionState {
  return {
    status: "connected",
    connectionId: "conn-1",
    providerAccountId: "accounts/1",
    connectedAt: "2026-01-01T00:00:00.000Z",
    location: CONNECTED_LOCATION,
  };
}

/** The common single-location resume path: one active, unbackfilled location. */
function mockSingleLocationResume() {
  vi.spyOn(ConnectionService, "getState").mockResolvedValue(connectedWithBackfill());
  vi.spyOn(ConnectionService, "listLocations").mockResolvedValue([persistedLocation()]);
}

describe("useOnboardingConnectFlow", () => {
  beforeEach(() => {
    searchParams = new URLSearchParams();
    replace.mockClear();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test("resumes straight into backfilling when a connected location has no completion stamp", async () => {
    mockSingleLocationResume();
    vi.spyOn(ConnectionService, "getBackfillProgress").mockResolvedValue(progress());

    const { result } = renderHook(() => useOnboardingConnectFlow());

    // Refresh-durability: the previous flow always restarted at "connect", so reloading mid-import
    // looked like the import had never been started.
    await waitFor(() => expect(result.current.stage).toBe("backfilling"));
    expect(result.current.reviewsFetched).toBe(5);
  });

  test("resumes at connect when the tenant has no connection", async () => {
    vi.spyOn(ConnectionService, "getState").mockResolvedValue({
      status: "disconnected",
      connectionId: null,
      providerAccountId: null,
      connectedAt: null,
      location: null,
    });
    const listLocations = vi.spyOn(ConnectionService, "listLocations");

    const { result } = renderHook(() => useOnboardingConnectFlow());
    await waitFor(() => expect(result.current.stage).toBe("connect"));
    // Short-circuits before asking what's persisted — there is no connection to have locations at all.
    expect(listLocations).not.toHaveBeenCalled();
  });

  test("resumes to done when every persisted location already finished its backfill", async () => {
    vi.spyOn(ConnectionService, "getState").mockResolvedValue(connectedWithBackfill());
    vi.spyOn(ConnectionService, "listLocations").mockResolvedValue([
      persistedLocation({ onboardingBackfillCompletedAt: "2026-01-02T00:00:00.000Z" }),
    ]);

    const { result } = renderHook(() => useOnboardingConnectFlow());
    await waitFor(() => expect(result.current.stage).toBe("done"));
  });

  test("does NOT advance to done on status 'ok' alone", async () => {
    // `ok` means the import job finished; `onboardingBackfillCompletedAt` is what un-gates live
    // polling. Advancing on `ok` shows "you're all set" for a location the scheduler still refuses.
    mockSingleLocationResume();
    vi.spyOn(ConnectionService, "getBackfillProgress").mockResolvedValue(
      progress({ status: "ok", livePollingEnabled: false, progress: 100, reviewsFetched: 20 }),
    );

    const { result } = renderHook(() => useOnboardingConnectFlow());

    await waitFor(() => expect(result.current.reviewsFetched).toBe(20));
    expect(result.current.stage).toBe("backfilling");
  });

  test("advances to done on livePollingEnabled", async () => {
    mockSingleLocationResume();
    vi.spyOn(ConnectionService, "getBackfillProgress").mockResolvedValue(
      progress({ status: "ok", livePollingEnabled: true, reviewsFetched: 20 }),
    );

    const { result } = renderHook(() => useOnboardingConnectFlow());
    await waitFor(() => expect(result.current.stage).toBe("done"));
  });

  test("reports a null progress rather than a fabricated percentage", async () => {
    mockSingleLocationResume();
    vi.spyOn(ConnectionService, "getBackfillProgress").mockResolvedValue(
      progress({ totalToImport: null, progress: null, reviewsFetched: 7 }),
    );

    const { result } = renderHook(() => useOnboardingConnectFlow());

    await waitFor(() => expect(result.current.reviewsFetched).toBe(7));
    // Drives the indeterminate bar — `reviewsFetched` is still real, so "7 imported" is shown.
    expect(result.current.progress).toBeNull();
    expect(result.current.totalToImport).toBeNull();
  });

  test("never lets progress visibly rewind", async () => {
    mockSingleLocationResume();
    const poll = vi
      .spyOn(ConnectionService, "getBackfillProgress")
      .mockResolvedValueOnce(progress({ progress: 80, reviewsFetched: 16, totalToImport: 20 }))
      // The provider revising its total between pages makes a smaller percentage legitimate — but
      // a bar that jumps backwards reads as the import undoing itself.
      .mockResolvedValue(progress({ progress: 40, reviewsFetched: 16, totalToImport: 40 }));

    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { result } = renderHook(() => useOnboardingConnectFlow());

    await waitFor(() => expect(result.current.progress).toBe(80));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });

    expect(poll.mock.calls.length).toBeGreaterThan(1);
    expect(result.current.progress).toBe(80);
  });

  test("surfaces an OAuth error from the callback and strips it from the URL", async () => {
    searchParams = new URLSearchParams({ error: "ACCOUNT_MISMATCH" });
    const getState = vi.spyOn(ConnectionService, "getState");

    const { result } = renderHook(() => useOnboardingConnectFlow());

    await waitFor(() => expect(result.current.stage).toBe("error"));
    expect(result.current.error).toEqual({ code: "ACCOUNT_MISMATCH", recovery: "restart" });
    // Stripped so a refresh cannot replay a stale error.
    expect(replace).toHaveBeenCalledWith("/onboarding/connect");
    // The error short-circuits: no point asking for state the user cannot act on yet.
    expect(getState).not.toHaveBeenCalled();
  });

  test("maps an unrecognized OAuth error code to a generic one rather than a missing translation", async () => {
    searchParams = new URLSearchParams({ error: "SOMETHING_NEW" });

    const { result } = renderHook(() => useOnboardingConnectFlow());

    await waitFor(() => expect(result.current.stage).toBe("error"));
    expect(result.current.error?.code).toBe("UNKNOWN");
  });

  test("keeps polling when a run reports itself stale, rather than failing", async () => {
    mockSingleLocationResume();
    vi.spyOn(ConnectionService, "getBackfillProgress").mockResolvedValue(
      progress({ isStale: true }),
    );

    const { result } = renderHook(() => useOnboardingConnectFlow());

    await waitFor(() => expect(result.current.isSlow).toBe(true));
    // Still importing — the backend's acquisition reclaims a genuinely dead run, and giving up
    // here would abandon a slow-but-alive one.
    expect(result.current.stage).toBe("backfilling");
  });

  test("stops polling after unmount", async () => {
    mockSingleLocationResume();
    const poll = vi
      .spyOn(ConnectionService, "getBackfillProgress")
      .mockResolvedValue(progress());

    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { result, unmount } = renderHook(() => useOnboardingConnectFlow());

    await waitFor(() => expect(result.current.stage).toBe("backfilling"));
    const callsBeforeUnmount = poll.mock.calls.length;
    unmount();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });

    // No setState-after-unmount, and no request left running behind a screen nobody is looking at.
    expect(poll.mock.calls.length).toBe(callsBeforeUnmount);
  });

  describe("multiple locations confirmed in one go", () => {
    /**
     * Regression: pre-selection used to be `available.filter(l => !l.alreadyConnected)` with no
     * fallback. `alreadyConnected` is true for any persisted row *including a deactivated one*, so
     * a tenant who disconnected and came back saw every location flagged as connected, selected
     * nothing, and hit a disabled Continue — and in the single-location case the card renders with
     * no checkbox at all, leaving no control on screen to recover with.
     */
    test("falls back to selecting everything when every location reads as already connected", async () => {
      vi.spyOn(ConnectionService, "getState").mockResolvedValue(connectedWithBackfill());
      vi.spyOn(ConnectionService, "listLocations").mockResolvedValue([]);
      vi.spyOn(ConnectionService, "listAvailableLocations").mockResolvedValue([
        { externalLocationId: "locations/1", name: "Downtown", address: null, alreadyConnected: true },
      ]);

      const { result } = renderHook(() => useOnboardingConnectFlow());

      await waitFor(() => expect(result.current.stage).toBe("confirm_location"));
      // Not `[]` — that would render a disabled Continue with no way to select anything.
      expect(result.current.selectedLocationIds).toEqual(["locations/1"]);
    });

    test("still prefers the not-yet-connected ones when there are any", async () => {
      vi.spyOn(ConnectionService, "getState").mockResolvedValue(connectedWithBackfill());
      vi.spyOn(ConnectionService, "listLocations").mockResolvedValue([]);
      vi.spyOn(ConnectionService, "listAvailableLocations").mockResolvedValue([
        { externalLocationId: "locations/1", name: "Downtown", address: null, alreadyConnected: true },
        { externalLocationId: "locations/2", name: "Uptown", address: null, alreadyConnected: false },
      ]);

      const { result } = renderHook(() => useOnboardingConnectFlow());

      await waitFor(() => expect(result.current.stage).toBe("confirm_location"));
      expect(result.current.selectedLocationIds).toEqual(["locations/2"]);
    });

    test("confirms every selected location and only finishes once all of them are live", async () => {
      vi.spyOn(ConnectionService, "getState").mockResolvedValue(connectedWithBackfill());
      vi.spyOn(ConnectionService, "listLocations").mockResolvedValue([]);
      vi.spyOn(ConnectionService, "listAvailableLocations").mockResolvedValue([
        { externalLocationId: "locations/1", name: "Downtown", address: null, alreadyConnected: false },
        { externalLocationId: "locations/2", name: "Uptown", address: null, alreadyConnected: false },
      ]);
      vi.spyOn(ConnectionService, "confirmLocations").mockImplementation(async (ids) =>
        ids.map((externalLocationId, index) => ({
          id: `loc-${index + 1}`,
          provider: "google" as const,
          externalLocationId,
          businessName: externalLocationId,
          address: null,
          status: "active" as const,
          lastSyncedAt: null,
          lastSyncStatus: null,
          lastSyncError: null,
          onboardingBackfillCompletedAt: null,
          backfill: { syncRunId: `run-${index + 1}`, status: "running", startedAt: "2026-01-01T00:00:00.000Z" },
          backfillAlreadyRunning: false,
        })),
      );

      const progressByLocation: Record<string, BackfillProgress> = {
        "loc-1": progress({ locationId: "loc-1", reviewsFetched: 10, totalToImport: 10, livePollingEnabled: true, status: "ok" }),
        "loc-2": progress({ locationId: "loc-2", reviewsFetched: 4, totalToImport: 10, livePollingEnabled: false }),
      };
      const poll = vi
        .spyOn(ConnectionService, "getBackfillProgress")
        .mockImplementation(async (id) => progressByLocation[id] ?? progress());

      // Installed before the first render — a fake-timers switch partway through a test does not
      // retroactively adopt a setTimeout a real clock already scheduled, so the loc-2 re-poll
      // below would never fire if this were installed only right before advancing time.
      vi.useFakeTimers({ shouldAdvanceTime: true });
      const { result } = renderHook(() => useOnboardingConnectFlow());
      await waitFor(() => expect(result.current.stage).toBe("confirm_location"));
      expect(result.current.selectedLocationIds).toEqual(["locations/1", "locations/2"]);

      act(() => result.current.confirmLocation());
      await waitFor(() => expect(result.current.stage).toBe("backfilling"));

      // Aggregate across both locations, not just one — 10 + 4.
      await waitFor(() => expect(result.current.reviewsFetched).toBe(14));
      // loc-2 is still running, so the screen must not report "done" yet even though loc-1 is live.
      expect(result.current.stage).toBe("backfilling");
      expect(poll).toHaveBeenCalledWith("loc-1", expect.anything());
      expect(poll).toHaveBeenCalledWith("loc-2", expect.anything());

      progressByLocation["loc-2"] = progress({
        locationId: "loc-2",
        reviewsFetched: 10,
        totalToImport: 10,
        livePollingEnabled: true,
        status: "ok",
      });

      await act(async () => {
        await vi.advanceTimersByTimeAsync(3000);
      });

      await waitFor(() => expect(result.current.stage).toBe("done"));
      expect(result.current.reviewsFetched).toBe(20);
    });

    /**
     * Regression: the aggregate treated "every location that has answered so far" as "every
     * location", so whichever one replied first defined the denominator. A small store that
     * finished instantly put the combined bar at 100% — and, the bar being monotonic, pinned it
     * there — while its siblings were still importing thousands of reviews.
     */
    test("does not report a complete bar while a confirmed location has not reported yet", async () => {
      vi.spyOn(ConnectionService, "getState").mockResolvedValue(connectedWithBackfill());
      vi.spyOn(ConnectionService, "listLocations").mockResolvedValue([]);
      vi.spyOn(ConnectionService, "listAvailableLocations").mockResolvedValue([
        { externalLocationId: "locations/1", name: "Downtown", address: null, alreadyConnected: false },
        { externalLocationId: "locations/2", name: "Uptown", address: null, alreadyConnected: false },
      ]);
      vi.spyOn(ConnectionService, "confirmLocations").mockImplementation(async (ids) =>
        ids.map((externalLocationId, index) => ({
          id: `loc-${index + 1}`,
          provider: "google" as const,
          externalLocationId,
          businessName: externalLocationId,
          address: null,
          status: "active" as const,
          lastSyncedAt: null,
          lastSyncStatus: null,
          lastSyncError: null,
          onboardingBackfillCompletedAt: null,
          backfill: { syncRunId: `run-${index + 1}`, status: "running", startedAt: "2026-01-01T00:00:00.000Z" },
          backfillAlreadyRunning: false,
        })),
      );

      // loc-1 answers immediately and is already fully imported; loc-2 never answers at all.
      vi.spyOn(ConnectionService, "getBackfillProgress").mockImplementation(async (id) => {
        if (id === "loc-1") {
          return progress({ locationId: "loc-1", reviewsFetched: 40, totalToImport: 40 });
        }
        return new Promise<BackfillProgress>(() => undefined);
      });

      const { result } = renderHook(() => useOnboardingConnectFlow());
      await waitFor(() => expect(result.current.stage).toBe("confirm_location"));

      act(() => result.current.confirmLocation());
      await waitFor(() => expect(result.current.reviewsFetched).toBe(40));

      // 40/40 for the one location that answered would be 100% — but loc-2's total is still
      // unknown, so the combined total is unknowable and the bar must stay indeterminate.
      expect(result.current.totalToImport).toBeNull();
      expect(result.current.progress).toBeNull();
    });

    test("toggling a location adds or removes it from the selection", async () => {
      vi.spyOn(ConnectionService, "getState").mockResolvedValue({
        status: "disconnected",
        connectionId: "conn-1",
        providerAccountId: "accounts/1",
        connectedAt: "2026-01-01T00:00:00.000Z",
        location: null,
      });
      vi.spyOn(ConnectionService, "listLocations").mockResolvedValue([]);
      vi.spyOn(ConnectionService, "listAvailableLocations").mockResolvedValue([
        { externalLocationId: "locations/1", name: "Downtown", address: null, alreadyConnected: false },
        { externalLocationId: "locations/2", name: "Uptown", address: null, alreadyConnected: false },
      ]);

      const { result } = renderHook(() => useOnboardingConnectFlow());
      await waitFor(() => expect(result.current.stage).toBe("confirm_location"));
      expect(result.current.selectedLocationIds).toEqual(["locations/1", "locations/2"]);

      act(() => result.current.toggleLocation("locations/1"));
      expect(result.current.selectedLocationIds).toEqual(["locations/2"]);

      act(() => result.current.toggleLocation("locations/1"));
      expect(result.current.selectedLocationIds).toEqual(["locations/2", "locations/1"]);
    });
  });
});
