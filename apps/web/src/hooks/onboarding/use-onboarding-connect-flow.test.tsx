import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import {
  type BackfillProgress,
  ConnectionService,
  type ConnectionState,
} from "@/app/_libs/services/connection.service";

import { useOnboardingConnectFlow } from "./use-onboarding-connect-flow";

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
    vi.spyOn(ConnectionService, "getState").mockResolvedValue(connectedWithBackfill());
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

    const { result } = renderHook(() => useOnboardingConnectFlow());
    await waitFor(() => expect(result.current.stage).toBe("connect"));
  });

  test("does NOT advance to done on status 'ok' alone", async () => {
    // `ok` means the import job finished; `onboardingBackfillCompletedAt` is what un-gates live
    // polling. Advancing on `ok` shows "you're all set" for a location the scheduler still refuses.
    vi.spyOn(ConnectionService, "getState").mockResolvedValue(connectedWithBackfill());
    vi.spyOn(ConnectionService, "getBackfillProgress").mockResolvedValue(
      progress({ status: "ok", livePollingEnabled: false, progress: 100, reviewsFetched: 20 }),
    );

    const { result } = renderHook(() => useOnboardingConnectFlow());

    await waitFor(() => expect(result.current.reviewsFetched).toBe(20));
    expect(result.current.stage).toBe("backfilling");
  });

  test("advances to done on livePollingEnabled", async () => {
    vi.spyOn(ConnectionService, "getState").mockResolvedValue(connectedWithBackfill());
    vi.spyOn(ConnectionService, "getBackfillProgress").mockResolvedValue(
      progress({ status: "ok", livePollingEnabled: true, reviewsFetched: 20 }),
    );

    const { result } = renderHook(() => useOnboardingConnectFlow());
    await waitFor(() => expect(result.current.stage).toBe("done"));
  });

  test("reports a null progress rather than a fabricated percentage", async () => {
    vi.spyOn(ConnectionService, "getState").mockResolvedValue(connectedWithBackfill());
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
    vi.spyOn(ConnectionService, "getState").mockResolvedValue(connectedWithBackfill());
    const poll = vi
      .spyOn(ConnectionService, "getBackfillProgress")
      .mockResolvedValueOnce(progress({ progress: 80, reviewsFetched: 16 }))
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
    vi.spyOn(ConnectionService, "getState").mockResolvedValue(connectedWithBackfill());
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
    vi.spyOn(ConnectionService, "getState").mockResolvedValue(connectedWithBackfill());
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
});
