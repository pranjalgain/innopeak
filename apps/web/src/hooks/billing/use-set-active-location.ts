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
 * Reports success as a boolean after toasting rather than exposing the raw mutation. Invalidates
 * `connectionLocationsQueryKey` as well as the subscription: the paused/active badges come from the
 * locations list, so invalidating only the subscription left the UI stale after the swap.
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
