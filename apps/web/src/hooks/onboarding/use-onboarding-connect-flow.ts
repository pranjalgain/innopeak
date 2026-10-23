"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";


import { ROUTES } from "@/app/_libs/constants/routes";
import { ApiError } from "@/app/_libs/services/api-error";
import { BillingService } from "@/app/_libs/services/billing.service";
import {
  type AvailableLocation,
  type BackfillProgress,
  ConnectionService,
  type PendingAccount,
} from "@/app/_libs/services/connection.service";

/** `null` when unlimited or unknown. A failed read must not block the picker (the backend enforces on confirm); at least 1 so Continue stays usable. */
async function remainingLocationCapacity(): Promise<number | null> {
  try {
    const subscription = await BillingService.getSubscription();
    if (subscription.maxLocations === null) return null;
    return Math.max(1, subscription.maxLocations - subscription.activeLocationCount);
  } catch {
    return null;
  }
}

export type OnboardingConnectStage =
  | "checking"
  | "connect"
  | "redirecting"
  | "choose_account"
  | "submitting_account"
  | "loading_locations"
  | "confirm_location"
  | "submitting_location"
  | "backfilling"
  | "done"
  | "error";

export type ErrorRecovery = "retry" | "reconnect" | "restart" | "continue";

export interface ConnectFlowError {
  /** A translation key under `onboardingConnect.errors`. */
  code: string;
  recovery: ErrorRecovery;
  /** Backend text shown verbatim instead of the `code` translation, for failures whose reason varies (e.g. a plan's location limit). */
  message?: string;
}

interface UseOnboardingConnectFlowResult {
  stage: OnboardingConnectStage;
  error: ConnectFlowError | null;
  /** The Business Profile accounts to choose between, after a grant that manages several. */
  accounts: PendingAccount[];
  selectedAccountId: string | null;
  selectAccount: (accountId: string) => void;
  confirmAccount: () => void;
  locations: AvailableLocation[];
  selectedLocationIds: string[];
  /** True when the plan has room for exactly one more location, so the picker is a radio group rather than checkboxes. */
  isSingleSelect: boolean;
  /** Summed across every location currently backfilling. */
  progress: number | null;
  reviewsFetched: number;
  totalToImport: number | null;
  /** Running unusually long. Not a failure — the poll continues. */
  isSlow: boolean;
  startConnect: () => void;
  toggleLocation: (externalLocationId: string) => void;
  confirmLocation: () => void;
  retry: () => void;
}

const POLL_INTERVAL_MS = 2500;

/** Consecutive failed polls of one location before giving up (a flaky network recovers well inside this; a dead backend does not). */
const MAX_CONSECUTIVE_POLL_FAILURES = 6;
const MAX_POLL_BACKOFF_MS = 30_000;

const SLOW_BACKFILL_GIVE_UP_MS = 10 * 60 * 1000;

/** Key for the resume chain's controller in `abortControllersRef`, alongside location-id keys. */
const RESUME_ABORT_KEY = "__resume__";

/** Where a reconnect that began in Settings ends, matching the backend's one-account callback redirect. */
const SETTINGS_CONNECTED_PATH = `${ROUTES.SETTINGS}?tab=connection&connected=1`;

/** The accounts still waiting for a choice, or `null` when none is (410) or the read fails; never blocks resuming. */
async function readPendingAccounts(signal: AbortSignal): Promise<PendingAccount[] | null> {
  try {
    return await ConnectionService.listPendingAccounts(signal);
  } catch {
    return null;
  }
}

const OAUTH_ERROR_RECOVERY: Record<string, ErrorRecovery> = {
  INVALID_STATE: "restart",
  ACCESS_DENIED: "retry",
  PROVIDER_ERROR: "retry",
  ACCOUNT_MISMATCH: "restart",
  INSUFFICIENT_SCOPE: "reconnect",
  SERVER_ERROR: "retry",
};

interface LocationBackfillState {
  reviewsFetched: number;
  totalToImport: number | null;
  isStale: boolean;
}

/**
 * - Resumes on mount from `GET /v1/connections` plus `GET /v1/connections/locations` (the former
 *   reports only the single selected location), so a refresh mid-import picks up where it left off.
 * - Advances on `livePollingEnabled`, never `status === "ok"`: `ok` means the import job finished,
 *   but `onboardingBackfillCompletedAt` is what un-gates the live poller.
 * - Each confirmed location polls independently while exposed numbers are sums; "done" needs every
 *   location live, and any one failing fails the whole screen.
 */
export function useOnboardingConnectFlow(): UseOnboardingConnectFlowResult {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [stage, setStage] = useState<OnboardingConnectStage>("checking");
  const [error, setError] = useState<ConnectFlowError | null>(null);
  const [accounts, setAccounts] = useState<PendingAccount[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  const [locations, setLocations] = useState<AvailableLocation[]>([]);
  const [selectedLocationIds, setSelectedLocationIds] = useState<string[]>([]);
  const [isSingleSelect, setIsSingleSelect] = useState(false);
  const [confirmedLocationIds, setConfirmedLocationIds] = useState<string[]>([]);
  const [progress, setProgress] = useState<number | null>(null);
  const [reviewsFetched, setReviewsFetched] = useState(0);
  const [totalToImport, setTotalToImport] = useState<number | null>(null);
  const [isSlow, setIsSlow] = useState(false);

  const abortControllersRef = useRef<Map<string, AbortController>>(new Map());
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const mountedRef = useRef(true);
  const slowSinceRef = useRef<number | null>(null);
  // Outside React state: only the aggregate needs to render.
  const locationStateRef = useRef<Record<string, LocationBackfillState>>({});
  const resolvedRef = useRef<Set<string>>(new Set());
  // Consecutive failed polls per location; a successful poll clears its entry.
  const pollFailuresRef = useRef<Map<string, number>>(new Map());
  // Synchronous mirror of `confirmedLocationIds`: the first polls start in the same tick as
  // `setConfirmedLocationIds`, so reading state would see a stale length and never detect "all done".
  const confirmedLocationIdsRef = useRef<string[]>([]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      abortControllersRef.current.forEach((controller) => controller.abort());
      timersRef.current.forEach((timer) => clearTimeout(timer));
    };
  }, []);

  const stopAllPolling = useCallback(() => {
    abortControllersRef.current.forEach((controller) => controller.abort());
    timersRef.current.forEach((timer) => clearTimeout(timer));
    abortControllersRef.current = new Map();
    timersRef.current = new Map();
  }, []);

  const fail = useCallback((code: string, recovery: ErrorRecovery, message?: string) => {
    if (!mountedRef.current) return;
    setError(message !== undefined ? { code, recovery, message } : { code, recovery });
    setStage("error");
  }, []);

  const showAccountChoice = useCallback((pending: PendingAccount[]) => {
    setAccounts(pending);
    // Nothing preselected: connecting the wrong business account is worse than one extra click.
    setSelectedAccountId(null);
    setStage("choose_account");
  }, []);

  const recomputeAggregate = useCallback(() => {
    const entries = Object.values(locationStateRef.current);
    const totalReviews = entries.reduce((sum, entry) => sum + entry.reviewsFetched, 0);
    // Every confirmed location must have reported a total, not just those that answered so far;
    // otherwise a small store finishing first sets the whole denominator and pins the bar at 100%.
    const everyTotalKnown =
      entries.length === confirmedLocationIdsRef.current.length &&
      entries.every((entry) => entry.totalToImport !== null);
    const total = everyTotalKnown
      ? entries.reduce((sum, entry) => sum + (entry.totalToImport ?? 0), 0)
      : null;
    const rawProgress = total === null ? null : total === 0 ? 100 : Math.min(100, Math.round((totalReviews / total) * 100));

    setReviewsFetched(totalReviews);
    setTotalToImport(total);
    // Monotonic: a provider revising a total between pages must not rewind the bar.
    setProgress((current) => (rawProgress === null ? current : Math.max(current ?? 0, rawProgress)));

    const anyStale = entries.some((entry) => entry.isStale);
    if (anyStale) {
      slowSinceRef.current ??= Date.now();
      setIsSlow(true);
    } else {
      slowSinceRef.current = null;
      setIsSlow(false);
    }
  }, []);

  /** Folds one location's snapshot into the aggregate and reports whether to keep polling *this* location. */
  const applyLocationProgress = useCallback(
    (locationId: string, snapshot: BackfillProgress): boolean => {
      const previous = locationStateRef.current[locationId];
      locationStateRef.current[locationId] = {
        reviewsFetched: Math.max(previous?.reviewsFetched ?? 0, snapshot.reviewsFetched ?? 0),
        totalToImport: snapshot.totalToImport,
        isStale: snapshot.isStale,
      };
      recomputeAggregate();

      // `isStale` isn't a failure (the run may be alive); give up after a bounded window so a dead job can't spin forever.
      if (slowSinceRef.current && Date.now() - slowSinceRef.current > SLOW_BACKFILL_GIVE_UP_MS) {
        fail("backfillFailed", "retry");
        return false;
      }

      if (snapshot.status === "error") {
        fail("backfillFailed", "retry");
        return false;
      }

      // The only correct terminal signal (see the hook's doc comment).
      if (snapshot.livePollingEnabled) {
        resolvedRef.current.add(locationId);
        if (resolvedRef.current.size === confirmedLocationIdsRef.current.length) {
          setStage("done");
        }
        return false;
      }

      return true;
    },
    [fail, recomputeAggregate],
  );

  // A `useCallback` can't reference itself, and a recursive closure would capture a stale
  // `applyLocationProgress`; the ref always points at the current implementation.
  const pollOneRef = useRef<(id: string) => Promise<void>>(async () => undefined);

  const pollOne = useCallback(
    async (locationId: string): Promise<void> => {
      abortControllersRef.current.get(locationId)?.abort();
      const controller = new AbortController();
      abortControllersRef.current.set(locationId, controller);

      try {
        const snapshot = await ConnectionService.getBackfillProgress(locationId, controller.signal);
        if (!mountedRef.current || controller.signal.aborted) return;

        pollFailuresRef.current.delete(locationId);
        if (applyLocationProgress(locationId, snapshot)) {
          // setTimeout after the response, not setInterval: a slow backend would otherwise stack overlapping requests.
          timersRef.current.set(
            locationId,
            setTimeout(() => void pollOneRef.current(locationId), POLL_INTERVAL_MS),
          );
        }
      } catch (caught) {
        if (!mountedRef.current || controller.signal.aborted) return;
        // A failed poll isn't a failed import, but a 404 means the location is gone.
        // A refused session (401/403) will not recover by retrying, and a backend that keeps failing is not coming back soon: both end the
        // wait instead of polling for as long as the tab stays open.
        const failures = (pollFailuresRef.current.get(locationId) ?? 0) + 1;
        pollFailuresRef.current.set(locationId, failures);
        const refused =
          caught instanceof ApiError && (caught.statusCode === 401 || caught.statusCode === 403);
        if (
          (caught instanceof ApiError && caught.statusCode === 404) ||
          refused ||
          failures >= MAX_CONSECUTIVE_POLL_FAILURES
        ) {
          fail("backfillFailed", "restart");
          return;
        }
        timersRef.current.set(
          locationId,
          setTimeout(
            () => void pollOneRef.current(locationId),
            Math.min(POLL_INTERVAL_MS * 2 ** (failures - 1), MAX_POLL_BACKOFF_MS),
          ),
        );
      }
    },
    [applyLocationProgress, fail],
  );

  // In an effect, not render: a render that never commits would leave the ref on a discarded closure.
  useEffect(() => {
    pollOneRef.current = pollOne;
  }, [pollOne]);

  const startBackfill = useCallback(
    (ids: string[]) => {
      // Abort the previous attempt first so a straggling response can't fold stale numbers into the new run.
      stopAllPolling();
      locationStateRef.current = {};
      resolvedRef.current = new Set();
      pollFailuresRef.current = new Map();
      confirmedLocationIdsRef.current = ids;
      slowSinceRef.current = null;

      setIsSlow(false);
      setProgress(null);
      setReviewsFetched(0);
      setTotalToImport(null);
      setConfirmedLocationIds(ids);
      setStage("backfilling");
      ids.forEach((id) => void pollOne(id));
    },
    [pollOne, stopAllPolling],
  );

  // Background tabs throttle timers to ~1/minute, so re-poll unresolved locations on return.
  useEffect(() => {
    if (stage !== "backfilling" || confirmedLocationIds.length === 0) return;

    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      for (const id of confirmedLocationIds) {
        if (resolvedRef.current.has(id)) continue;
        const timer = timersRef.current.get(id);
        if (timer) clearTimeout(timer);
        void pollOne(id);
      }
    };

    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [stage, confirmedLocationIds, pollOne]);

  const loadLocations = useCallback(async (signal?: AbortSignal) => {
    setStage("loading_locations");

    try {
      const available = await ConnectionService.listAvailableLocations(signal);
      if (!mountedRef.current || signal?.aborted) return;

      if (available.length === 0) {
        fail("loadLocationsFailed", "reconnect");
        return;
      }

      setLocations(available);
      // Not-yet-connected locations start checked, so Continue imports everything Google returned.
      // If none are, this is a reconnect (`alreadyConnected` is true even for deactivated rows) and
      // an empty selection would strand the user with Continue disabled, so fall back to all.
      const notYetConnected = available.filter((location) => !location.alreadyConnected);
      const candidates = notYetConnected.length > 0 ? notYetConnected : available;
      // Capped at plan capacity, or a Free tenant with two locations hits the limit on the first Continue. The server's
      // capacity is the only input: the backend enforces the same limit on confirm, so anything looser just fails there.
      const capacity = await remainingLocationCapacity();
      if (!mountedRef.current || signal?.aborted) return;
      const preselected = capacity === null ? candidates : candidates.slice(0, capacity);
      setSelectedLocationIds(preselected.map((location) => location.externalLocationId));
      setIsSingleSelect(capacity === 1);
      setStage("confirm_location");
    } catch (caught) {
      // Cancellation by a newer `resume()` (see `RESUME_ABORT_KEY`), not a failure; otherwise StrictMode's double-invoke would flash an error screen.
      if (!mountedRef.current || signal?.aborted) return;
      if (caught instanceof ApiError && caught.errorCode === "CONNECTION_NEEDS_REAUTH") {
        fail("needsReauth", "reconnect");
        return;
      }
      fail("loadLocationsFailed", "retry");
    }
  }, [fail]);

  const resume = useCallback(async () => {
    // StrictMode runs this twice and `mountedRef` is back to `true` by the time the stale chain
    // resolves, so abort any previous resume: only the latest may set state, and two concurrent
    // calls must not double up on credential refresh.
    abortControllersRef.current.get(RESUME_ABORT_KEY)?.abort();
    const controller = new AbortController();
    abortControllersRef.current.set(RESUME_ABORT_KEY, controller);
    const { signal } = controller;

    try {
      // Read alongside the state: a grant still waiting for the owner's choice wins over anything else, so a
      // refresh on the picker (or "Try again" after a failed choice) brings the picker back instead of a new consent.
      const [state, waitingAccounts] = await Promise.all([
        ConnectionService.getState(signal),
        readPendingAccounts(signal),
      ]);
      if (!mountedRef.current || signal.aborted) return;

      if (waitingAccounts !== null) {
        showAccountChoice(waitingAccounts);
        return;
      }

      // Branch on the connection row, not `status`: `status` is `disconnected` both for never
      // connected and for consent-granted-no-location-yet, which this flow exists to resolve.
      if (!state.connectionId) {
        setStage("connect");
        return;
      }

      if (state.status === "needs_reauth") {
        fail("needsReauth", "reconnect");
        return;
      }

      // `GET /v1/connections` reports only one selected location; the persisted list is the source of truth.
      const persisted = await ConnectionService.listLocations(signal);
      if (!mountedRef.current || signal.aborted) return;

      const active = persisted.filter((location) => location.status === "active");
      if (active.length === 0) {
        await loadLocations(signal);
        return;
      }

      const pending = active
        .filter((location) => !location.onboardingBackfillCompletedAt)
        .map((location) => location.id);

      if (pending.length === 0) {
        setStage("done");
        return;
      }

      startBackfill(pending);
    } catch {
      if (!mountedRef.current || signal.aborted) return;
      // Connect stage, not an error screen: "we couldn't check" is a dead end, and the flow can restart.
      setStage("connect");
    }
  }, [fail, loadLocations, startBackfill, showAccountChoice]);

  /** After consent for a grant that manages several accounts the backend redirects here to have the owner choose. */
  const loadPendingAccounts = useCallback(async (signal?: AbortSignal) => {
    setStage("loading_locations");

    try {
      const pending = await ConnectionService.listPendingAccounts(signal);
      if (!mountedRef.current || signal?.aborted) return;

      showAccountChoice(pending);
    } catch (caught) {
      if (!mountedRef.current || signal?.aborted) return;
      fail(
        caught instanceof ApiError && caught.statusCode === 410 ? "accountChoiceExpired" : "UNKNOWN",
        caught instanceof ApiError && caught.statusCode === 410 ? "restart" : "retry",
      );
    }
  }, [fail, showAccountChoice]);

  const selectAccount = useCallback((accountId: string) => {
    setSelectedAccountId(accountId);
  }, []);

  const confirmAccount = useCallback(() => {
    if (selectedAccountId === null) return;

    setStage("submitting_account");
    void (async () => {
      try {
        const { returnTo } = await ConnectionService.selectAccount(selectedAccountId);
        if (!mountedRef.current) return;
        if (returnTo === "settings") {
          // Started from Settings: finish there, as a one-account reconnect does.
          router.replace(SETTINGS_CONNECTED_PATH as Parameters<typeof router.replace>[0]);
          return;
        }
        // Connected: from here it is the ordinary flow (load locations, pick, import).
        await resume();
      } catch (caught) {
        if (!mountedRef.current) return;
        if (caught instanceof ApiError && caught.statusCode === 410) {
          fail("accountChoiceExpired", "restart");
        } else if (caught instanceof ApiError && caught.errorCode === "ACCOUNT_MISMATCH") {
          fail("ACCOUNT_MISMATCH", "restart");
        } else if (caught instanceof ApiError && caught.errorCode === "CONNECTION_NEEDS_REAUTH") {
          fail("needsReauth", "reconnect");
        } else {
          // The backend puts the grant back on any other failure, so "Try again" returns to the picker.
          fail("accountSelectFailed", "retry", caught instanceof ApiError ? caught.message : undefined);
        }
      }
    })();
  }, [selectedAccountId, resume, fail, router]);

  useEffect(() => {
    const oauthError = searchParams.get("error");
    const connected = searchParams.get("connected");
    const accountChoice = searchParams.get("account_choice");

    if (oauthError || connected || accountChoice) {
      // Stripped so a refresh can't replay a stale error or re-enter the post-consent branch.
      // Cast because Next's typed routes reject a runtime `pathname`.
      router.replace(pathname as Parameters<typeof router.replace>[0]);
    }

    if (oauthError) {
      // Own keys only: `?error=constructor` would otherwise find `Object.prototype.constructor` and read a function as the recovery.
      const known = Object.hasOwn(OAUTH_ERROR_RECOVERY, oauthError);
      fail(
        known ? oauthError : "UNKNOWN",
        known ? (OAUTH_ERROR_RECOVERY[oauthError] ?? "retry") : "retry",
      );
      return;
    }

    if (accountChoice === "pending") {
      void loadPendingAccounts();
      return;
    }

    void resume();
    // Mount-only: re-running on searchParams change would re-enter the flow right after `router.replace` strips them.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startConnect = useCallback(() => {
    setStage("redirecting");
    void ConnectionService.startAuthorize("onboarding");
  }, []);

  // With room for one location, choosing replaces the selection (a radio group); otherwise it toggles.
  const toggleLocation = useCallback(
    (externalLocationId: string) => {
      setSelectedLocationIds((current) =>
        isSingleSelect
          ? [externalLocationId]
          : current.includes(externalLocationId)
            ? current.filter((id) => id !== externalLocationId)
            : [...current, externalLocationId],
      );
    },
    [isSingleSelect],
  );

  const confirmLocation = useCallback(() => {
    if (selectedLocationIds.length === 0) return;

    setStage("submitting_location");

    void (async () => {
      try {
        const confirmed = await ConnectionService.confirmLocations(selectedLocationIds);
        if (!mountedRef.current) return;
        startBackfill(confirmed.map((location) => location.id));
      } catch (caught) {
        if (!mountedRef.current) return;
        if (caught instanceof ApiError && caught.errorCode === "CONNECTION_NEEDS_REAUTH") {
          fail("needsReauth", "reconnect");
          return;
        }
        // Show the backend's message: the generic bucket would say "try again" for a limit no retry fixes.
        if (caught instanceof ApiError && caught.errorCode === "LOCATION_LIMIT_REACHED") {
          fail("confirmFailed", "retry", caught.message);
          return;
        }
        fail("confirmFailed", "retry");
      }
    })();
  }, [selectedLocationIds, startBackfill, fail]);

  const retry = useCallback(() => {
    const recovery = error?.recovery;
    setError(null);
    setIsSlow(false);
    slowSinceRef.current = null;

    if (recovery === "reconnect" || recovery === "restart") {
      // Siblings of the failed location are still polling; stop them or they'd keep hitting
      // `/backfill` behind the Connect screen and `fail()` the user off a recovered screen.
      stopAllPolling();
      setStage("connect");
      return;
    }

    if (confirmedLocationIds.length > 0) {
      startBackfill(confirmedLocationIds);
      return;
    }

    setStage("checking");
    void resume();
  }, [error, confirmedLocationIds, resume, startBackfill, stopAllPolling]);

  return {
    stage,
    error,
    accounts,
    selectedAccountId,
    selectAccount,
    confirmAccount,
    locations,
    selectedLocationIds,
    isSingleSelect,
    progress,
    reviewsFetched,
    totalToImport,
    isSlow,
    startConnect,
    toggleLocation,
    confirmLocation,
    retry,
  };
}
