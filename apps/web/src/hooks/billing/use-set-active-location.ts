import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useCallback } from "react";
import { toast } from "sonner";

import { BillingService } from "@/app/_libs/services/billing.service";
import { subscriptionQueryKey } from "@/hooks/billing/use-subscription";
import { connectionLocationsQueryKey } from "@/hooks/connections/use-business-switcher";

interface UseSetActiveLocationResult {
  setActiveLocation: (locationId: string) => Promise<boolean>;
  isUpdating: boolean;
}

/**
 * `PUT /v1/billing/active-location` — §3a's "choose which connected location stays active" write.
 * Mirrors `useUpdatePlatformSettings`'s shape: a `mutateAsync` wrapped in a stable callback that
 * toasts and reports success/failure as a boolean, rather than exposing react-query's raw mutation
 * object to the section component. On success, invalidates both `subscriptionQueryKey`
 * (`activeLocationCount`) AND `connectionLocationsQueryKey` — `ChooseActiveLocationCard`'s own
 * paused/active badges are driven by the locations list, not the subscription summary, so
 * invalidating only the former left the swap correctly applied server-side while the UI kept
 * showing the pre-swap state until an unrelated refetch happened to occur.
 */
export function useSetActiveLocation(): UseSetActiveLocationResult {
  const t = useTranslations("settings.billing.chooseLocation.toasts");
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: (locationId: string) => BillingService.setActiveLocation(locationId),
  });

  const setActiveLocation = useCallback(
    async (locationId: string) => {
      try {
        await mutation.mutateAsync(locationId);
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: subscriptionQueryKey }),
          queryClient.invalidateQueries({ queryKey: connectionLocationsQueryKey }),
        ]);
        toast.success(t("updated"));
        return true;
      } catch {
        toast.error(t("updateFailed"));
        return false;
      }
    },
    [mutation, queryClient, t],
  );

  return { setActiveLocation, isUpdating: mutation.isPending };
}
