"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import * as React from "react";

import { ApiError } from "@/app/_libs/services/api-client";
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
  selectedLocationId: string | null;
  /** 0-100, or null for an indeterminate bar — never a fabricated percentage. */
  progress: number | null;
  reviewsFetched: number;
  totalToImport: number | null;
  /** Running unusually long. Not a failure — the poll continues. */
  isSlow: boolean;
  startConnect: () => void;
  selectLocation: (externalLocationId: string) => void;
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

/**
 * Drives the connect flow against the real backend, replacing a `setInterval` that filled a
 * progress bar over ~2.5 seconds and a `localStorage` flag that recorded "connected".
 *
 * The two properties that matter most, and that the fake version could not have:
 *
 *  - **It resumes.** On mount it reads `GET /v1/connections` and jumps straight to whichever stage
 *    the tenant is actually in, so a refresh mid-import — or coming back tomorrow — picks up where
 *    it left off instead of restarting from "Connect".
 *  - **It advances on `livePollingEnabled`, never on `status === "ok"`.** Those are different
 *    facts: `ok` means the import job finished, while `onboardingBackfillCompletedAt` is what
 *    un-gates the live poller. Advancing on `ok` would show "you're all set" for a location the
 *    scheduler still refuses to enqueue.
 */
export function useOnboardingConnectFlow(): UseOnboardingConnectFlowResult {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [stage, setStage] = React.useState<OnboardingConnectStage>("checking");
  const [error, setError] = React.useState<ConnectFlowError | null>(null);
  const [locations, setLocations] = React.useState<AvailableLocation[]>([]);
  const [selectedLocationId, setSelectedLocationId] = React.useState<string | null>(null);
  const [locationId, setLocationId] = React.useState<string | null>(null);
  const [progress, setProgress] = React.useState<number | null>(null);
  const [reviewsFetched, setReviewsFetched] = React.useState(0);
  const [totalToImport, setTotalToImport] = React.useState<number | null>(null);
  const [isSlow, setIsSlow] = React.useState(false);

  const abortRef = React.useRef<AbortController | null>(null);
  const timerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = React.useRef(true);
  const slowSinceRef = React.useRef<number | null>(null);

  React.useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      abortRef.current?.abort();
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const fail = React.useCallback((code: string, recovery: ErrorRecovery) => {
    if (!mountedRef.current) return;
    setError({ code, recovery });
    setStage("error");
  }, []);

  // ── Backfill polling ────────────────────────────────────────────────────

  const applyProgress = React.useCallback(
    (snapshot: BackfillProgress) => {
      setReviewsFetched((current) => Math.max(current, snapshot.reviewsFetched ?? 0));
      setTotalToImport(snapshot.totalToImport);
      // Monotonic: a recount (the provider revising its total between pages) must never make the
      // bar visibly rewind, which reads as the import going backwards.
      setProgress((current) =>
        snapshot.progress === null ? null : Math.max(current ?? 0, snapshot.progress),
      );

      // `isStale` is not a failure — the run may still be alive, and the backend's acquisition will
      // reclaim it if it is not. Swap to "taking longer than usual" copy and keep polling, giving
      // up only after a bounded window so this cannot spin forever behind a dead job.
      if (snapshot.isStale) {
        slowSinceRef.current ??= Date.now();
        setIsSlow(true);
        if (Date.now() - slowSinceRef.current > SLOW_BACKFILL_GIVE_UP_MS) {
          fail("backfillFailed", "retry");
          return false;
        }
      } else {
        slowSinceRef.current = null;
        setIsSlow(false);
      }

      // The ONLY correct terminal signal — see this hook's doc comment.
      if (snapshot.livePollingEnabled) {
        setStage("done");
        return false;
      }

      if (snapshot.status === "error") {
        fail("backfillFailed", "retry");
        return false;
      }

      return true;
    },
    [fail],
  );

  // The poll re-schedules itself, so it needs a stable handle to call. A `useCallback` cannot
  // reference itself inside its own body (it is not yet bound when the body is created), and a
  // plain recursive closure would capture a stale `applyProgress`. The ref is assigned on every
  // render, so each tick calls the current implementation.
  const pollBackfillRef = React.useRef<(id: string) => Promise<void>>(async () => undefined);

  const pollBackfill = React.useCallback(
    async (id: string): Promise<void> => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const snapshot = await ConnectionService.getBackfillProgress(id, controller.signal);
        if (!mountedRef.current || controller.signal.aborted) return;

        if (applyProgress(snapshot)) {
          // Recursive setTimeout scheduled *after* the response lands, not setInterval — a backend
          // slower than the interval would otherwise stack overlapping requests, each one making
          // the next slower.
          timerRef.current = setTimeout(() => void pollBackfillRef.current(id), POLL_INTERVAL_MS);
        }
      } catch (caught) {
        if (!mountedRef.current || controller.signal.aborted) return;
        // A single failed poll is not a failed import. Keep polling; the give-up window above is
        // what eventually stops it.
        if (caught instanceof ApiError && caught.statusCode === 404) {
          fail("backfillFailed", "restart");
          return;
        }
        timerRef.current = setTimeout(() => void pollBackfillRef.current(id), POLL_INTERVAL_MS);
      }
    },
    [applyProgress, fail],
  );

  // Assigned in an effect, not during render: React forbids mutating a ref in the render phase
  // (a re-render that never commits would leave the ref pointing at a discarded closure).
  React.useEffect(() => {
    pollBackfillRef.current = pollBackfill;
  }, [pollBackfill]);

  const startBackfill = React.useCallback(
    (id: string) => {
      setLocationId(id);
      setStage("backfilling");
      void pollBackfill(id);
    },
    [pollBackfill],
  );

  // Background tabs throttle timers to roughly once a minute, so a user who switches away and back
  // would otherwise see a bar frozen where they left it. Re-poll immediately on return.
  React.useEffect(() => {
    if (stage !== "backfilling" || !locationId) return;

    const onVisible = () => {
      if (document.visibilityState === "visible") {
        if (timerRef.current) clearTimeout(timerRef.current);
        void pollBackfill(locationId);
      }
    };

    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [stage, locationId, pollBackfill]);

  // ── Location discovery ──────────────────────────────────────────────────

  const loadLocations = React.useCallback(async () => {
    setStage("loading_locations");

    try {
      const available = await ConnectionService.listAvailableLocations();
      if (!mountedRef.current) return;

      if (available.length === 0) {
        fail("loadLocationsFailed", "reconnect");
        return;
      }

      setLocations(available);
      // Pre-selected, but still shown: silently taking locations[0] would let a franchise connect
      // the wrong store with no visible recourse.
      setSelectedLocationId(available[0]?.externalLocationId ?? null);
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

  const resume = React.useCallback(async () => {
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

      if (state.location) {
        if (state.location.onboardingBackfillCompletedAt) {
          setStage("done");
        } else {
          startBackfill(state.location.id);
        }
        return;
      }

      // Connected, but no location confirmed yet — exactly where the OAuth callback lands.
      await loadLocations();
    } catch {
      if (!mountedRef.current) return;
      // Fail to the connect stage rather than an error screen: the user can always start the flow
      // again, and an error screen for "we couldn't check" is a dead end.
      setStage("connect");
    }
  }, [fail, loadLocations, startBackfill]);

  React.useEffect(() => {
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

  const startConnect = React.useCallback(() => {
    setStage("redirecting");
    void ConnectionService.startAuthorize("onboarding");
  }, []);

  const selectLocation = React.useCallback((externalLocationId: string) => {
    setSelectedLocationId(externalLocationId);
  }, []);

  const confirmLocation = React.useCallback(() => {
    if (!selectedLocationId) return;

    setStage("submitting_location");

    void (async () => {
      try {
        const confirmed = await ConnectionService.confirmLocation(selectedLocationId);
        if (!mountedRef.current) return;
        startBackfill(confirmed.id);
      } catch (caught) {
        if (!mountedRef.current) return;
        if (caught instanceof ApiError && caught.errorCode === "CONNECTION_NEEDS_REAUTH") {
          fail("needsReauth", "reconnect");
          return;
        }
        fail("confirmFailed", "retry");
      }
    })();
  }, [selectedLocationId, startBackfill, fail]);

  const retry = React.useCallback(() => {
    const recovery = error?.recovery;
    setError(null);
    setIsSlow(false);
    slowSinceRef.current = null;

    if (recovery === "reconnect" || recovery === "restart") {
      setStage("connect");
      return;
    }

    if (locationId) {
      startBackfill(locationId);
      return;
    }

    setStage("checking");
    void resume();
  }, [error, locationId, resume, startBackfill]);

  return {
    stage,
    error,
    locations,
    selectedLocationId,
    progress,
    reviewsFetched,
    totalToImport,
    isSlow,
    startConnect,
    selectLocation,
    confirmLocation,
    retry,
  };
}
