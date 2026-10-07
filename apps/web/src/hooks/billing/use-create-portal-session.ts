import { useMutation, type UseMutationResult } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { BillingService } from "@/app/_libs/services/billing.service";

/** Same full-page-redirect shape as `useCreateCheckoutSession`: no success toast. */
export function useCreatePortalSession(): UseMutationResult<void, unknown, void> {
  const t = useTranslations("settings.billing.toasts");

  return useMutation({
    mutationFn: async () => {
      const { url } = await BillingService.createPortalSession();
      window.location.href = url;
    },
    onError: () => {
      toast.error(t("portalFailed"));
    },
  });
}
