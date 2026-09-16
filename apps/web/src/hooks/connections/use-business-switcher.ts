import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useCallback, useRef } from "react";
import { toast } from "sonner";

import {
  type ConnectedLocation,
  ConnectionService,
  type ConnectionState,
} from "@/app/_libs/services/connection.service";
import { connectionQueryKey, useConnection } from "@/hooks/connections/use-connection";

export const connectionLocationsQueryKey = ["connections", "locations"] as const;

interface UseBusinessSwitcherResult {
  /** Every confirmed, still-active location — the pool a member/owner can pick from. */
  locations: ConnectedLocation[];
  /** The tenant-wide current selection, or null before it's loaded / with nothing confirmed yet. */
  activeLocationId: string | null;
  isLoading: boolean;
  isSwitching: boolean;
  switchTo: (locationId: string) => Promise<void>;
}

/**
 * Backs the Business Switcher dropdown. Reads off the same two endpoints the onboarding flow
 * already uses (`useConnection()` for "which one is active", `listLocations()` for "what can I
 * choose from") and adds the one thing neither exposes: switching it.
 *
 * `tenants.active_location_id` is a single value shared by the whole tenant, not per-user —
 * switching here changes what every member sees, which is why the backend restricts the write to
 * an owner. This hook doesn't pre-check that itself (there is no app-wide "am I the owner" read
 * today); a member's attempt 403s server-side and surfaces as the toast below, the same way every
 * other owner-only action in this app already relies on the backend to enforce its own guard.
 */
export function useBusinessSwitcher(): UseBusinessSwitcherResult {
  const t = useTranslations("businessSwitcher");
  const queryClient = useQueryClient();
  const { state } = useConnection();
  /** Monotonic id of the most recent `switchTo` call — see the race note inside it. */
  const latestSwitchRef = useRef(0);

  const locationsQuery = useQuery({
    queryKey: connectionLocationsQueryKey,
    queryFn: ({ signal }) => ConnectionService.listLocations(signal),
    // Nothing to list before there is even a connection — avoids a request that would just 200
    // with an empty array on every signed-out-feeling render (pre-onboarding, or mid-reconnect).
    enabled: state?.connectionId != null,
  });

  const switchMutation = useMutation({
    mutationFn: (locationId: string) => ConnectionService.setActiveLocation(locationId),
  });

  const switchTo = useCallback(
    async (locationId: string) => {
      // Last *click* wins, not last response. Two switches in quick succession settle in whatever
      // order the server answers, and the loser used to overwrite the winner — leaving the cache
      // (and so the dashboard's query key, and the switcher's own checkmark) on a location that is
      // not the one `tenants.active_location_id` now holds, with nothing to correct it until
      // `["connection"]` next refetches: 5-minute staleTime, no refetch on focus.
      const requestId = ++latestSwitchRef.current;

      try {
        const updated = await switchMutation.mutateAsync(locationId);
        if (requestId !== latestSwitchRef.current) return;

        // Direct cache write, not an invalidate-and-refetch: `connectionQueryKey` is shared
        // app-wide (dashboard guard, Settings), and this is the one field of it that changed —
        // no need to re-ask the server for the rest.
        queryClient.setQueryData<ConnectionState>(connectionQueryKey, (current) =>
          current ? { ...current, location: updated } : current,
        );
      } catch {
        if (requestId !== latestSwitchRef.current) return;
        toast.error(t("switchFailed"));
      }
    },
    [switchMutation, queryClient, t],
  );

  return {
    locations: (locationsQuery.data ?? []).filter((location) => location.status === "active"),
    activeLocationId: state?.location?.id ?? null,
    isLoading: locationsQuery.isLoading,
    isSwitching: switchMutation.isPending,
    switchTo,
  };
}
