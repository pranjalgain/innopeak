"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";


import { ApiError } from "@/app/_libs/services/api-error";
import {
  type AvailableLocation,
  type BackfillProgress,
  ConnectionService,
} from "@/app/_libs/services/connection.service";

export type OnboardingConnectStage =
  | "checking"
  | "connect"
  | "redirecting"
  | "loading_locations"
  | "confirm_location"
  | "submitting_location"
  | "backfilling"
  | "done"
  | "error";

/** What the user can actually *do* about a failure. Keeps the stage components dumb. */
export type ErrorRecovery = "retry" | "reconnect" | "restart" | "continue";

export interface ConnectFlowError {
  /** A translation key under `onboardingConnect.errors`. */
  code: string;
  recovery: ErrorRecovery;
}

interface UseOnboardingConnectFlowResult {
  stage: OnboardingConnectStage;
  error: ConnectFlowError | null;
  locations: AvailableLocation[];
  selectedLocationIds: string[];
  /** Aggregated across every location currently backfilling — the sum of each one's imports. */
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

/** Poll cadence. Recursive setTimeout, not setInterval — see `scheduleNextPoll`. */
const POLL_INTERVAL_MS = 2500;

/** How long a stale-looking backfill is tolerated before it is reported as failed. */
const SLOW_BACKFILL_GIVE_UP_MS = 10 * 60 * 1000;

const OAUTH_ERROR_RECOVERY: Record<string, ErrorRecovery> = {
  INVALID_STATE: "restart",
  ACCESS_DENIED: "retry",
  PROVIDER_ERROR: "retry",
  ACCOUNT_MISMATCH: "restart",
  INSUFFICIENT_SCOPE: "reconnect",
  SERVER_ERROR: "retry",
};

/** What this hook tracks per confirmed location while its backfill is in flight. */
interface LocationBackfillState {
  reviewsFetched: number;
  totalToImport: number | null;
  isStale: boolean;
}

/**
 * Drives the connect flow against the real backend, replacing a `setInterval` that filled a
 * progress bar over ~2.5 seconds and a `localStorage` flag that recorded "connected".
 *
 * The two properties that matter most, and that the fake version could not have:
 *
 *  - **It resumes.** On mount it reads `GET /v1/connections` (is there a connection at all?) and,
 *    once connected, `GET /v1/connections/locations` (every location this tenant has confirmed —
 *    `GET /v1/connections` itself only ever reports the tenant's single currently-selected one,
 *    which is not enough once several locations can be confirmed at once) to jump straight to
 *    whichever stage the tenant is actually in. A refresh mid-import — or coming back tomorrow —
 *    picks up where it left off instead of restarting from "Connect".
 *  - **It advances on `livePollingEnabled`, never on `status === "ok"`.** Those are different
 *    facts: `ok` means the import job finished, while `onboardingBackfillCompletedAt` is what
 *    un-gates the live poller. Advancing on `ok` would show "you're all set" for a location the
 *    scheduler still refuses to enqueue.
 *
 * Several locations can be confirmed in one go, so every location backfills independently and in
 * parallel — its own poll loop, its own abort controller — while the numbers this hook exposes
 * are the sum across all of them: "you're all set" only once every one of them is actually live,
 * and any single location failing fails the whole screen rather than silently leaving one store
 * behind with no visible indication.
 */
export function useOnboardingConnectFlow(): UseOnboardingConnectFlowResult {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [stage, setStage] = useState<OnboardingConnectStage>("checking");
  const [error, setError] = useState<ConnectFlowError | null>(null);
  const [locations, setLocations] = useState<AvailableLocation[]>([]);
  const [selectedLocationIds, setSelectedLocationIds] = useState<string[]>([]);
  const [confirmedLocationIds, setConfirmedLocationIds] = useState<string[]>([]);
  const [progress, setProgress] = useState<number | null>(null);
  const [reviewsFetched, setReviewsFetched] = useState(0);
  const [totalToImport, setTotalToImport] = useState<number | null>(null);
  const [isSlow, setIsSlow] = useState(false);

  const abortControllersRef = useRef<Map<string, AbortController>>(new Map());
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const mountedRef = useRef(true);
  const slowSinceRef = useRef<number | null>(null);
  // Per-location running totals, kept outside React state — only the aggregate below needs to
  // trigger a render, and each location's own contribution has to survive independently of when
  // its neighbors last responded.
  const locationStateRef = useRef<Record<string, LocationBackfillState>>({});
  const resolvedRef = useRef<Set<string>>(new Set());
  // Mirrors `confirmedLocationIds`, updated synchronously inside `startBackfill` — `applyLocationProgress`
  // reads this rather than the state value because `startBackfill` kicks off the first poll for
  // each location in the same tick it calls `setConfirmedLocationIds`, before React has committed
  // that state update. Reading the state itself there would compare against last render's (stale,
  // often still `[]`) length and never detect "every location is done".
  const confirmedLocationIdsRef = useRef<string[]>([]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      abortControllersRef.current.forEach((controller) => controller.abort());
      timersRef.current.forEach((timer) => clearTimeout(timer));
    };
  }, []);

  /** Stops every in-flight poll and its scheduled follow-up. `startBackfill` does this for itself
   *  before starting a fresh run; the stage resets below need it too. */
  const stopAllPolling = useCallback(() => {
    abortControllersRef.current.forEach((controller) => controller.abort());
    timersRef.current.forEach((timer) => clearTimeout(timer));
    abortControllersRef.current = new Map();
    timersRef.current = new Map();
  }, []);

  const fail = useCallback((code: string, recovery: ErrorRecovery) => {
    if (!mountedRef.current) return;
    setError({ code, recovery });
    setStage("error");
  }, []);

  // ── Backfill polling ────────────────────────────────────────────────────

  const recomputeAggregate = useCallback(() => {
    const entries = Object.values(locationStateRef.current);
    const totalReviews = entries.reduce((sum, entry) => sum + entry.reviewsFetched, 0);
    // Every *confirmed* location has to have reported a total, not merely every location that has
    // answered so far: `locationStateRef` only gains an entry once that location's first poll
    // lands. Judging completeness on `entries.length > 0` let whichever location replied first
    // define the whole denominator — a small store that finished instantly would put the combined
    // bar at 100% (and, being monotonic, pin it there) while its siblings were still importing
    // thousands of reviews.
    const everyTotalKnown =
      entries.length === confirmedLocationIdsRef.current.length &&
      entries.every((entry) => entry.totalToImport !== null);
    const total = everyTotalKnown
      ? entries.reduce((sum, entry) => sum + (entry.totalToImport ?? 0), 0)
      : null;
    const rawProgress = total === null ? null : total === 0 ? 100 : Math.min(100, Math.round((totalReviews / total) * 100));

    setReviewsFetched(totalReviews);
    setTotalToImport(total);
    // Monotonic, same reasoning as the single-location version: a provider revising one
    // location's total between pages must never make the combined bar visibly rewind.
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

      // `isStale` is not a failure — the run may still be alive, and the backend's acquisition will
      // reclaim it if it is not. Give up only after a bounded window so a single dead job cannot
      // spin the whole screen forever.
      if (slowSinceRef.current && Date.now() - slowSinceRef.current > SLOW_BACKFILL_GIVE_UP_MS) {
        fail("backfillFailed", "retry");
        return false;
      }

      if (snapshot.status === "error") {
        fail("backfillFailed", "retry");
        return false;
      }

      // The ONLY correct terminal signal — see this hook's doc comment.
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

  // The poll re-schedules itself, so it needs a stable handle to call. A `useCallback` cannot
  // reference itself inside its own body (it is not yet bound when the body is created), and a
  // plain recursive closure would capture a stale `applyLocationProgress`. The ref is assigned on
  // every render, so each tick calls the current implementation.
  const pollOneRef = useRef<(id: string) => Promise<void>>(async () => undefined);

  const pollOne = useCallback(
    async (locationId: string): Promise<void> => {
      abortControllersRef.current.get(locationId)?.abort();
      const controller = new AbortController();
      abortControllersRef.current.set(locationId, controller);

      try {
        const snapshot = await ConnectionService.getBackfillProgress(locationId, controller.signal);
        if (!mountedRef.current || controller.signal.aborted) return;

        if (applyLocationProgress(locationId, snapshot)) {
          // Recursive setTimeout scheduled *after* the response lands, not setInterval — a backend
          // slower than the interval would otherwise stack overlapping requests per location, each
          // one making the next slower.
          timersRef.current.set(
            locationId,
            setTimeout(() => void pollOneRef.current(locationId), POLL_INTERVAL_MS),
          );
        }
      } catch (caught) {
        if (!mountedRef.current || controller.signal.aborted) return;
        // A single failed poll is not a failed import. Keep polling; the give-up window above is
        // what eventually stops it. A 404, though, means the location itself is gone.
        if (caught instanceof ApiError && caught.statusCode === 404) {
          fail("backfillFailed", "restart");
          return;
        }
        timersRef.current.set(
          locationId,
          setTimeout(() => void pollOneRef.current(locationId), POLL_INTERVAL_MS),
        );
      }
    },
    [applyLocationProgress, fail],
  );

  // Assigned in an effect, not during render: React forbids mutating a ref in the render phase
  // (a re-render that never commits would leave the ref pointing at a discarded closure).
  useEffect(() => {
    pollOneRef.current = pollOne;
  }, [pollOne]);

  const startBackfill = useCallback(
    (ids: string[]) => {
      // Abort anything still in flight from a previous attempt (e.g. a `retry`) before resetting
      // state, so a straggling response cannot fold stale numbers into the fresh run.
      stopAllPolling();
      locationStateRef.current = {};
      resolvedRef.current = new Set();
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

  // Background tabs throttle timers to roughly once a minute, so a user who switches away and back
  // would otherwise see bars frozen where they left them. Re-poll every unresolved location on return.
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

  // ── Location discovery ──────────────────────────────────────────────────

  const loadLocations = useCallback(async () => {
    setStage("loading_locations");

    try {
      const available = await ConnectionService.listAvailableLocations();
      if (!mountedRef.current) return;

      if (available.length === 0) {
        fail("loadLocationsFailed", "reconnect");
        return;
      }

      setLocations(available);
      // Every not-yet-connected location starts checked: the ask is "track all the businesses",
      // so continuing without touching anything imports everything Google returned. Already
      // -connected locations start unchecked — re-selecting them is harmless (the backend treats
      // a re-confirm as idempotent) but reads as "importing again" for no reason.
      //
      // ...unless that would select nothing at all, which is a reconnect: `alreadyConnected` is
      // true for any persisted row including a deactivated one, so a tenant who disconnected and
      // came back sees every location flagged as connected. Leaving the selection empty there
      // strands them — Continue is disabled with nothing selected, and the single-location branch
      // renders a plain card with no checkbox to turn back on. Falling back to "all of them" is
      // also just the right default: re-confirming is exactly what this screen is for.
      const notYetConnected = available.filter((location) => !location.alreadyConnected);
      const preselected = notYetConnected.length > 0 ? notYetConnected : available;
      setSelectedLocationIds(preselected.map((location) => location.externalLocationId));
      setStage("confirm_location");
    } catch (caught) {
      if (!mountedRef.current) return;
      if (caught instanceof ApiError && caught.errorCode === "CONNECTION_NEEDS_REAUTH") {
        fail("needsReauth", "reconnect");
        return;
      }
      fail("loadLocationsFailed", "retry");
    }
  }, [fail]);

  // ── Mount: read the callback's query params, then resume ────────────────

  const resume = useCallback(async () => {
    try {
      const state = await ConnectionService.getState();
      if (!mountedRef.current) return;

      // Branch on the *connection row*, not on `status`. `status` answers "is this tenant fully
      // set up" — it is `disconnected` both when the tenant has never connected AND in the state
      // this flow exists to resolve: consent granted, no location confirmed yet. Keying the
      // connect stage off `status` alone sent the user back to "Connect" immediately after a
      // successful OAuth round trip, with no way to ever reach location selection.
      if (!state.connectionId) {
        setStage("connect");
        return;
      }

      if (state.status === "needs_reauth") {
        fail("needsReauth", "reconnect");
        return;
      }

      // `GET /v1/connections` only ever reports the tenant's single currently-selected location —
      // not enough to resume correctly once several can be confirmed in one go. The persisted list
      // is the actual source of truth for "what has this tenant confirmed so far".
      const persisted = await ConnectionService.listLocations();
      if (!mountedRef.current) return;

      const active = persisted.filter((location) => location.status === "active");
      if (active.length === 0) {
        // Connected, but nothing confirmed yet — exactly where the OAuth callback lands.
        await loadLocations();
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
      if (!mountedRef.current) return;
      // Fail to the connect stage rather than an error screen: the user can always start the flow
      // again, and an error screen for "we couldn't check" is a dead end.
      setStage("connect");
    }
  }, [fail, loadLocations, startBackfill]);

  useEffect(() => {
    const oauthError = searchParams.get("error");
    const connected = searchParams.get("connected");

    if (oauthError || connected) {
      // Stripped so a refresh cannot replay a stale error, or re-enter the post-consent branch
      // after the user has moved on. Cast because Next's typed routes reject a runtime `pathname`,
      // even though this only ever removes a query string from the route already rendering.
      router.replace(pathname as Parameters<typeof router.replace>[0]);
    }

    if (oauthError) {
      fail(
        oauthError in OAUTH_ERROR_RECOVERY ? oauthError : "UNKNOWN",
        OAUTH_ERROR_RECOVERY[oauthError] ?? "retry",
      );
      return;
    }

    void resume();
    // Deliberately mount-only: this reads the one-shot callback params, and re-running it on every
    // searchParams change would re-enter the flow immediately after `router.replace` strips them.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Actions ─────────────────────────────────────────────────────────────

  const startConnect = useCallback(() => {
    setStage("redirecting");
    void ConnectionService.startAuthorize("onboarding");
  }, []);

  const toggleLocation = useCallback((externalLocationId: string) => {
    setSelectedLocationIds((current) =>
      current.includes(externalLocationId)
        ? current.filter((id) => id !== externalLocationId)
        : [...current, externalLocationId],
    );
  }, []);

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
      // One location failing puts the whole screen in the error stage, but its siblings' poll
      // loops are still running — only the unmount cleanup and `startBackfill` ever stopped them,
      // and this branch does neither. They would keep hitting `/backfill` every 2.5s behind the
      // Connect screen, and a sibling that later reported `status: "error"` would call `fail()`
      // and drag the user off a screen they had already recovered to.
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
    locations,
    selectedLocationIds,
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
