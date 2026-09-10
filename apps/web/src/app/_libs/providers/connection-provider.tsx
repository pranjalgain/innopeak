"use client";

import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { ApiError } from "@/app/_libs/services/api-error";
import { ConnectionService, type ConnectionState } from "@/app/_libs/services/connection.service";

export interface ConnectionContextValue {
  state: ConnectionState | null;
  /** True until the first fetch settles — distinct from "fetched and found nothing". */
  isLoading: boolean;
  /**
   * Set when the fetch failed for a reason that is NOT a 401. The guard fails *open* on this: a
   * transient 5xx or a dropped network must not eject a paying customer into onboarding. A genuine
   * 401 is already handled upstream (ApiClient clears the token, RequireAuth redirects to /login),
   * so failing open here cannot mask an auth failure.
   */
  error: Error | null;
  refresh: () => Promise<void>;
}

const ConnectionContext = createContext<ConnectionContextValue | null>(null);

/**
 * Fetches `GET /v1/connections` once for the whole dashboard, so the guard does not refetch on
 * every navigation. Mounted in `(dashboard)/layout.tsx`.
 */
export function ConnectionProvider({ children }: { children: ReactNode }) {
  const value = useConnectionFetcher();
  return <ConnectionContext.Provider value={value}>{children}</ConnectionContext.Provider>;
}

/**
 * Reads the shared connection state, falling back to its own fetch outside the dashboard layout —
 * the onboarding-connect screen lives in a different route group and needs the same data.
 */
export function useConnection(): ConnectionContextValue {
  const context = useContext(ConnectionContext);
  const standalone = useConnectionFetcher({ enabled: context === null });

  return context ?? standalone;
}

function useConnectionFetcher({
  enabled = true,
}: { enabled?: boolean } = {}): ConnectionContextValue {
  const [state, setState] = useState<ConnectionState | null>(null);
  const [isLoading, setIsLoading] = useState(enabled);
  const [error, setError] = useState<Error | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const load = useCallback(async () => {
    if (!enabled) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setIsLoading(true);
    try {
      const next = await ConnectionService.getState(controller.signal);
      if (controller.signal.aborted) return;
      setState(next);
      setError(null);
    } catch (caught) {
      if (controller.signal.aborted) return;
      // A 401 is not recorded as an error: ApiClient has already cleared the token and RequireAuth
      // is about to redirect, so surfacing it here would race a "connection unavailable" toast
      // against a login redirect.
      if (!(caught instanceof ApiError && caught.statusCode === 401)) {
        setError(caught instanceof Error ? caught : new Error("Failed to load connection"));
      }
    } finally {
      if (!controller.signal.aborted) setIsLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    void load();
    return () => abortRef.current?.abort();
  }, [load]);

  return useMemo(
    () => ({ state, isLoading, error, refresh: load }),
    [state, isLoading, error, load],
  );
}
