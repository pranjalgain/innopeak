import { useMutation, type UseMutationResult } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { BillingService } from "@/app/_libs/services/billing.service";

/**
 * `POST /v1/billing/portal` — starts a Stripe (or Dummy) Customer Portal session. Same
 * full-page-redirect shape as `useCreateCheckoutSession` — no success toast, the redirect is the
 * feedback. Only a failure to start the session (no Stripe customer on file yet) surfaces one.
 */
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
