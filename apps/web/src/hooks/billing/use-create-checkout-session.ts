import { useMutation, type UseMutationResult } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { BillingService } from "@/app/_libs/services/billing.service";

/** Full-page redirect, so no success toast: the redirect is the feedback. Only a failure to start the session toasts. */
export function useCreateCheckoutSession(): UseMutationResult<void, unknown, void> {
  const t = useTranslations("settings.billing.toasts");

  return useMutation({
    mutationFn: async () => {
      const { url } = await BillingService.createCheckoutSession();
      window.location.href = url;
    },
    onError: () => {
      toast.error(t("checkoutFailed"));
    },
  });
}
