import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useCallback, useRef } from "react";
import { toast } from "sonner";

import { ApiError } from "@/app/_libs/services/api-error";
import {
  type ConnectedLocation,
  ConnectionService,
  type ConnectionState,
} from "@/app/_libs/services/connection.service";
import { connectionQueryKey, useConnection } from "@/hooks/connections/use-connection";
import { currentTenantQueryKey } from "@/hooks/tenant/use-tenant";

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
 * Reads `useConnection()` (active) and `listLocations()` (choices) and adds switching. `tenants.active_location_id` is
 * tenant-wide, so the backend restricts the write to an owner; this hook doesn't pre-check, a member's attempt 403s.
 */
export function useBusinessSwitcher(): UseBusinessSwitcherResult {
  const t = useTranslations("businessSwitcher");
  const queryClient = useQueryClient();
  const { state } = useConnection();
    /** Monotonic id of the latest `switchTo` call, for the race noted inside it. */
  const latestSwitchRef = useRef(0);

  const locationsQuery = useQuery({
    queryKey: connectionLocationsQueryKey,
    queryFn: ({ signal }) => ConnectionService.listLocations(signal),
    // Nothing to list before there is a connection (pre-onboarding, mid-reconnect).
    enabled: state?.connectionId != null,
  });

  const switchMutation = useMutation({
    mutationFn: (locationId: string) => ConnectionService.setActiveLocation(locationId),
  });

  const switchTo = useCallback(
    async (locationId: string) => {
      // Last click wins, not last response: out-of-order replies let the loser overwrite the winner, leaving the cache on a
      // location that isn't `tenants.active_location_id` until `["connection"]` refetches (5-minute staleTime, no refetch on focus).
      const requestId = ++latestSwitchRef.current;

      try {
        const updated = await switchMutation.mutateAsync(locationId);
        if (requestId !== latestSwitchRef.current) return;

        // Direct cache write, not invalidate-and-refetch: `connectionQueryKey` is shared app-wide and only this field changed.
        queryClient.setQueryData<ConnectionState>(connectionQueryKey, (current) =>
          current ? { ...current, location: updated } : current,
        );
        // The dashboard's business card is built from the connection once and cached under its own key (5-minute staleTime): without this
        // it kept the previous location's name, address and rating beside the new location's numbers.
        void queryClient.invalidateQueries({ queryKey: currentTenantQueryKey });
      } catch (error) {
        if (requestId !== latestSwitchRef.current) return;
        // A member's attempt 403s (switching is tenant-wide and owner-only); a generic "please try again" would tell them to
        // retry an action the backend will never allow.
        if (error instanceof ApiError && error.statusCode === 403) {
          toast.error(t("switchForbidden"));
        } else {
          toast.error(t("switchFailed"));
        }
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
