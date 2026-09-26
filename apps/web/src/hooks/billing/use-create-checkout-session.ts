import { useMutation, type UseMutationResult } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { BillingService } from "@/app/_libs/services/billing.service";

/**
 * `POST /v1/billing/checkout` — starts the Stripe (or Dummy) Checkout session. On success this is
 * a full-page redirect to the returned URL, not a client-side route: the browser is leaving the
 * app entirely (to Stripe's hosted Checkout, or the Dummy provider's local confirmation page), so
 * there is no toast on success — the redirect itself is the feedback. Only a failure to even start
 * the session (e.g. `PAYMENT_FEATURE_ENABLED` off) surfaces a toast.
 */
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
