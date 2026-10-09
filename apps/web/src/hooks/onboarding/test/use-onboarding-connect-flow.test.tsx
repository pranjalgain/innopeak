import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { ApiError } from "@/app/_libs/services/api-error";
import { BillingService } from "@/app/_libs/services/billing.service";
import {
  type BackfillProgress,
  type ConnectedLocation,
  ConnectionService,
  type ConnectionState,
} from "@/app/_libs/services/connection.service";
import { OnboardingContextService } from "@/app/_libs/services/onboarding-context.service";

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
  billingPausedAt: null,
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

function mockSingleLocationResume() {
  vi.spyOn(ConnectionService, "getState").mockResolvedValue(connectedWithBackfill());
  vi.spyOn(ConnectionService, "listLocations").mockResolvedValue([persistedLocation()]);
}

describe("useOnboardingConnectFlow", () => {
  beforeEach(() => {
    searchParams = new URLSearchParams();
    replace.mockClear();
    vi.restoreAllMocks();
    // Every resume also asks for a waiting account choice; usually there is none.
    vi.spyOn(ConnectionService, "listPendingAccounts").mockRejectedValue(
      new ApiError(410, "none pending", "ACCOUNT_CHOICE_EXPIRED"),
    );
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test("resumes straight into backfilling when a connected location has no completion stamp", async () => {
    mockSingleLocationResume();
    vi.spyOn(ConnectionService, "getBackfillProgress").mockResolvedValue(progress());

    const { result } = renderHook(() => useOnboardingConnectFlow());

    // Refresh-durability: reloading mid-import must resume, not restart at "connect".
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
    // Short-circuits: with no connection there are no locations to ask about.
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
    // `ok` only means the import job finished; `onboardingBackfillCompletedAt` un-gates live polling.
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
    // Indeterminate bar, but `reviewsFetched` is real so "7 imported" shows.
    expect(result.current.progress).toBeNull();
    expect(result.current.totalToImport).toBeNull();
  });

  test("never lets progress visibly rewind", async () => {
    mockSingleLocationResume();
    const poll = vi
      .spyOn(ConnectionService, "getBackfillProgress")
      .mockResolvedValueOnce(progress({ progress: 80, reviewsFetched: 16, totalToImport: 20 }))
      // The provider may revise its total between pages; the bar must still never jump backwards.
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

  describe("choosing between several Business Profile accounts", () => {
    const ACCOUNTS = [
      { accountId: "accounts/1", name: "Jane Doe", type: "PERSONAL" },
      { accountId: "accounts/2", name: "Coastal Group", type: "LOCATION_GROUP" },
    ];

    beforeEach(() => {
      searchParams = new URLSearchParams({ account_choice: "pending" });
    });

    test("lists the accounts when the callback sends the owner here, with nothing preselected", async () => {
      const getState = vi.spyOn(ConnectionService, "getState");
      vi.spyOn(ConnectionService, "listPendingAccounts").mockResolvedValue(ACCOUNTS);

      const { result } = renderHook(() => useOnboardingConnectFlow());

      await waitFor(() => expect(result.current.stage).toBe("choose_account"));
      expect(result.current.accounts).toEqual(ACCOUNTS);
      expect(result.current.selectedAccountId).toBeNull();
      // Stripped so a refresh cannot replay it, and the ordinary resume is skipped: nothing is connected yet.
      expect(replace).toHaveBeenCalledWith("/onboarding/connect");
      expect(getState).not.toHaveBeenCalled();
    });

    test("does nothing on Continue until an account is chosen", async () => {
      vi.spyOn(ConnectionService, "listPendingAccounts").mockResolvedValue(ACCOUNTS);
      const selectAccount = vi.spyOn(ConnectionService, "selectAccount");
      const { result } = renderHook(() => useOnboardingConnectFlow());
      await waitFor(() => expect(result.current.stage).toBe("choose_account"));

      act(() => result.current.confirmAccount());

      expect(selectAccount).not.toHaveBeenCalled();
      expect(result.current.stage).toBe("choose_account");
    });

    test("connects the chosen account, then carries on with the ordinary flow", async () => {
      // Answered once; the choice is used up by the select, as on the server.
      vi.spyOn(ConnectionService, "listPendingAccounts")
        .mockResolvedValueOnce(ACCOUNTS)
        .mockRejectedValue(new ApiError(410, "used", "ACCOUNT_CHOICE_EXPIRED"));
      const selectAccount = vi
        .spyOn(ConnectionService, "selectAccount")
        .mockResolvedValue({ returnTo: "onboarding" });
      vi.spyOn(ConnectionService, "getState").mockResolvedValue({
        status: "connected",
        connectionId: "conn-1",
        providerAccountId: "accounts/2",
        connectedAt: "2026-01-01T00:00:00.000Z",
        location: null,
      });
      vi.spyOn(ConnectionService, "listLocations").mockResolvedValue([]);
      vi.spyOn(ConnectionService, "listAvailableLocations").mockResolvedValue([
        { externalLocationId: "locations/1", name: "Downtown", address: null, alreadyConnected: false },
      ]);
      vi.spyOn(BillingService, "getSubscription").mockResolvedValue({
        maxLocations: null,
        activeLocationCount: 0,
      } as Awaited<ReturnType<typeof BillingService.getSubscription>>);
      const { result } = renderHook(() => useOnboardingConnectFlow());
      await waitFor(() => expect(result.current.stage).toBe("choose_account"));

      act(() => result.current.selectAccount("accounts/2"));
      expect(result.current.selectedAccountId).toBe("accounts/2");
      act(() => result.current.confirmAccount());

      await waitFor(() => expect(result.current.stage).toBe("confirm_location"));
      expect(selectAccount).toHaveBeenCalledWith("accounts/2");
    });

    test("finishes in Settings when the reconnect began there", async () => {
      vi.spyOn(ConnectionService, "listPendingAccounts").mockResolvedValue(ACCOUNTS);
      vi.spyOn(ConnectionService, "selectAccount").mockResolvedValue({ returnTo: "settings" });
      const getState = vi.spyOn(ConnectionService, "getState");
      const { result } = renderHook(() => useOnboardingConnectFlow());
      await waitFor(() => expect(result.current.stage).toBe("choose_account"));

      act(() => result.current.selectAccount("accounts/2"));
      act(() => result.current.confirmAccount());

      await waitFor(() =>
        expect(replace).toHaveBeenCalledWith("/settings?tab=connection&connected=1"),
      );
      expect(getState).not.toHaveBeenCalled();
    });

    test.each([
      [410, "ACCOUNT_CHOICE_EXPIRED", "accountChoiceExpired", "restart"],
      [409, "ACCOUNT_MISMATCH", "ACCOUNT_MISMATCH", "restart"],
      [409, "CONNECTION_NEEDS_REAUTH", "needsReauth", "reconnect"],
    ])("a %s %s answer ends in the %s error with a %s recovery", async (status, errorCode, code, recovery) => {
      vi.spyOn(ConnectionService, "listPendingAccounts").mockResolvedValue(ACCOUNTS);
      vi.spyOn(ConnectionService, "selectAccount").mockRejectedValue(
        new ApiError(status, "no", errorCode),
      );
      const { result } = renderHook(() => useOnboardingConnectFlow());
      await waitFor(() => expect(result.current.stage).toBe("choose_account"));

      act(() => result.current.selectAccount("accounts/1"));
      act(() => result.current.confirmAccount());

      await waitFor(() => expect(result.current.stage).toBe("error"));
      expect(result.current.error).toEqual({ code, recovery });
    });

    test("shows the backend's own message for any other failure, and offers a retry", async () => {
      vi.spyOn(ConnectionService, "listPendingAccounts").mockResolvedValue(ACCOUNTS);
      vi.spyOn(ConnectionService, "selectAccount").mockRejectedValue(
        new ApiError(500, "Could not save the connection."),
      );
      const { result } = renderHook(() => useOnboardingConnectFlow());
      await waitFor(() => expect(result.current.stage).toBe("choose_account"));

      act(() => result.current.selectAccount("accounts/1"));
      act(() => result.current.confirmAccount());

      await waitFor(() => expect(result.current.stage).toBe("error"));
      expect(result.current.error).toEqual({
        code: "accountSelectFailed",
        recovery: "retry",
        message: "Could not save the connection.",
      });
    });

    // The server keeps the choice after such a failure, so "Try again" lands back on the picker.
    test("returns to the picker on retry after a failed choice", async () => {
      vi.spyOn(ConnectionService, "listPendingAccounts").mockResolvedValue(ACCOUNTS);
      vi.spyOn(ConnectionService, "selectAccount").mockRejectedValue(
        new ApiError(502, "Google is unavailable."),
      );
      vi.spyOn(ConnectionService, "getState").mockResolvedValue({
        status: "disconnected",
        connectionId: null,
        providerAccountId: null,
        connectedAt: null,
        location: null,
      });
      const { result } = renderHook(() => useOnboardingConnectFlow());
      await waitFor(() => expect(result.current.stage).toBe("choose_account"));
      act(() => result.current.selectAccount("accounts/1"));
      act(() => result.current.confirmAccount());
      await waitFor(() => expect(result.current.stage).toBe("error"));

      act(() => result.current.retry());

      await waitFor(() => expect(result.current.stage).toBe("choose_account"));
      expect(result.current.accounts).toEqual(ACCOUNTS);
    });

    test("an expired choice sends the owner to connect again instead of an empty picker", async () => {
      vi.spyOn(ConnectionService, "listPendingAccounts").mockRejectedValue(
        new ApiError(410, "expired"),
      );

      const { result } = renderHook(() => useOnboardingConnectFlow());

      await waitFor(() => expect(result.current.stage).toBe("error"));
      expect(result.current.error).toEqual({ code: "accountChoiceExpired", recovery: "restart" });
    });
  });

  // Regression: the query that opens the picker is stripped on arrival, so a refresh used to land on Connect.
  test("brings the picker back on a plain visit while a choice is still waiting", async () => {
    const accounts = [
      { accountId: "accounts/1", name: "Jane Doe", type: "PERSONAL" },
      { accountId: "accounts/2", name: "Coastal Group", type: "LOCATION_GROUP" },
    ];
    vi.spyOn(ConnectionService, "listPendingAccounts").mockResolvedValue(accounts);
    vi.spyOn(ConnectionService, "getState").mockResolvedValue({
      status: "disconnected",
      connectionId: null,
      providerAccountId: null,
      connectedAt: null,
      location: null,
    });

    const { result } = renderHook(() => useOnboardingConnectFlow());

    await waitFor(() => expect(result.current.stage).toBe("choose_account"));
    expect(result.current.accounts).toEqual(accounts);
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
    // Still importing: the backend reclaims a genuinely dead run, so giving up would abandon a slow-but-alive one.
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
    /** Regression: `alreadyConnected` is true for deactivated rows too, so a returning tenant had nothing pre-selected and a disabled Continue. */
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

    describe("plan capacity", () => {
      const TWO_LOCATIONS = [
        { externalLocationId: "locations/1", name: "Downtown", address: null, alreadyConnected: false },
        { externalLocationId: "locations/2", name: "Uptown", address: null, alreadyConnected: false },
      ];

      function mockPlan(maxLocations: number | null, activeLocationCount = 0) {
        vi.spyOn(BillingService, "getSubscription").mockResolvedValue({
          maxLocations,
          activeLocationCount,
        } as Awaited<ReturnType<typeof BillingService.getSubscription>>);
      }

      beforeEach(() => {
        vi.spyOn(ConnectionService, "getState").mockResolvedValue(connectedWithBackfill());
        vi.spyOn(ConnectionService, "listLocations").mockResolvedValue([]);
        vi.spyOn(ConnectionService, "listAvailableLocations").mockResolvedValue(TWO_LOCATIONS);
      });

      /** Regression: a Free tenant with two locations landed with both ticked and hit the plan's location limit on first Continue. */
      test("preselects only as many locations as the plan has room for", async () => {
        mockPlan(1);

        const { result } = renderHook(() => useOnboardingConnectFlow());

        await waitFor(() => expect(result.current.stage).toBe("confirm_location"));
        expect(result.current.selectedLocationIds).toEqual(["locations/1"]);
      });

      // Regression: a "paid" recorded only in the browser (a reconcile that failed, or a hand-typed success URL) overrode
      // the server's Free capacity, so every location was ticked and Continue was refused by the backend.
      test("follows the server's capacity even when the wizard recorded a Paid choice", async () => {
        window.sessionStorage.clear();
        OnboardingContextService.set({ from: "signup", via: "sso", plan: "paid" });
        mockPlan(1);

        const { result } = renderHook(() => useOnboardingConnectFlow());
        await waitFor(() => expect(result.current.stage).toBe("confirm_location"));

        expect(result.current.isSingleSelect).toBe(true);
        expect(result.current.selectedLocationIds).toEqual(["locations/1"]);
        window.sessionStorage.clear();
      });

      test("preselects everything on an unlimited plan", async () => {
        mockPlan(null);

        const { result } = renderHook(() => useOnboardingConnectFlow());

        await waitFor(() => expect(result.current.stage).toBe("confirm_location"));
        expect(result.current.selectedLocationIds).toEqual(["locations/1", "locations/2"]);
      });

      test("is a single choice when the plan has room for exactly one more location", async () => {
        mockPlan(1);

        const { result } = renderHook(() => useOnboardingConnectFlow());
        await waitFor(() => expect(result.current.stage).toBe("confirm_location"));

        expect(result.current.isSingleSelect).toBe(true);
        // Choosing replaces the selection rather than ticking a second one.
        act(() => result.current.toggleLocation("locations/2"));
        expect(result.current.selectedLocationIds).toEqual(["locations/2"]);
        act(() => result.current.toggleLocation("locations/1"));
        expect(result.current.selectedLocationIds).toEqual(["locations/1"]);
      });

      test("counts the room left, so a plan with one slot free is also a single choice", async () => {
        mockPlan(3, 2);

        const { result } = renderHook(() => useOnboardingConnectFlow());
        await waitFor(() => expect(result.current.stage).toBe("confirm_location"));

        expect(result.current.isSingleSelect).toBe(true);
      });

      test("is a multiple choice on an unlimited plan or when the plan cannot be read", async () => {
        mockPlan(null);
        const unlimited = renderHook(() => useOnboardingConnectFlow());
        await waitFor(() => expect(unlimited.result.current.stage).toBe("confirm_location"));
        expect(unlimited.result.current.isSingleSelect).toBe(false);
        unlimited.unmount();

        vi.spyOn(BillingService, "getSubscription").mockRejectedValue(new Error("down"));
        const unknown = renderHook(() => useOnboardingConnectFlow());
        await waitFor(() => expect(unknown.result.current.stage).toBe("confirm_location"));
        expect(unknown.result.current.isSingleSelect).toBe(false);
      });

      test("falls back to preselecting everything when the plan cannot be read", async () => {
        vi.spyOn(BillingService, "getSubscription").mockRejectedValue(new Error("down"));

        const { result } = renderHook(() => useOnboardingConnectFlow());

        await waitFor(() => expect(result.current.stage).toBe("confirm_location"));
        expect(result.current.selectedLocationIds).toEqual(["locations/1", "locations/2"]);
      });
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
          billingPausedAt: null,
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

      // Installed before the first render: fake timers don't adopt a setTimeout a real clock already scheduled.
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

    /** Regression: the aggregate treated locations answered so far as all locations, so a small store finishing first pinned the monotonic bar at 100%. */
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
          billingPausedAt: null,
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
