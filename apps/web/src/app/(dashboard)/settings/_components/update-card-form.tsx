import { CardElement, useElements, useStripe } from "@stripe/react-stripe-js";
import { useTranslations } from "next-intl";
import { type FormEvent, useRef, useState } from "react";
import { LuCheck, LuCreditCard, LuLock, LuSave, LuTriangleAlert } from "react-icons/lu";

import { PANEL_CLASS, PanelHeading } from "@/app/(dashboard)/settings/_components/billing-panel";
import { cn } from "@/app/_libs/utils/cn";
import { formatCardExpiryMonth } from "@/app/_libs/utils/payment-method";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useCreateSetupIntent } from "@/hooks/billing/use-create-setup-intent";
import { useSetDefaultPaymentMethod } from "@/hooks/billing/use-set-default-payment-method";
import { useSubscription } from "@/hooks/billing/use-subscription";
import type { PaymentMethodSummary } from "@/types/domain";

/** Fixed neutral colors rather than reading the app's own CSS variables — Stripe Elements renders
 *  inside a cross-origin iframe, so it can't inherit the page's theme tokens directly. Picked to
 *  read reasonably in both light and dark mode rather than tracking the live theme. */
const CARD_ELEMENT_OPTIONS = {
  style: {
    base: {
      fontSize: "14px",
      color: "#a1a1aa",
      "::placeholder": { color: "#71717a" },
    },
    invalid: { color: "#ef4444" },
  },
} as const;

/** A small colored pill for inline success/error feedback — the same "icon in a soft-tinted box"
 *  language `ConnectErrorStage`/`DoneStage` use for whole-page states, scaled down for a single
 *  form field's result instead of a full flow outcome. */
function InlineNotice({ tone, children }: { tone: "success" | "destructive"; children: string }) {
  const Icon = tone === "success" ? LuCheck : LuTriangleAlert;
  return (
    <p
      className={cn(
        "flex items-center gap-1.5 rounded-md px-2.5 py-2 text-[12.5px]",
        tone === "success" ? "bg-success-soft text-success" : "bg-destructive-soft text-destructive",
      )}>
      <Icon className="size-3.5 shrink-0" />
      {children}
    </p>
  );
}

/** Shows what's already on file — without this, the dialog's card input looks identical whether
 *  there's a saved card or not, since Stripe Elements never pre-fills a card number back (it only
 *  ever accepts new input). Reuses `useSubscription`'s cached data (same query key as the Settings
 *  page behind this dialog), so this costs no extra request. Styled as the same masked-card row
 *  `PaymentMethodRow` uses on the page behind this dialog, for visual continuity. */
function CurrentCard({ paymentMethod }: { paymentMethod: PaymentMethodSummary }) {
  const t = useTranslations("settings.billing.manageDialog.card");
  const expiry = formatCardExpiryMonth(paymentMethod.expMonth);

  return (
    <div className="border-border bg-background flex flex-wrap items-center gap-x-2.5 gap-y-1 rounded-md border px-3 py-2 text-[13px]">
      <LuCreditCard className="text-muted-foreground size-4 shrink-0" />
      <span className="font-medium capitalize">{paymentMethod.brand}</span>
      <span className="text-muted-foreground">•••• {paymentMethod.last4}</span>
      <span className="text-muted-foreground sm:ml-auto">
        {t("expires", { month: expiry, year: paymentMethod.expYear })}
      </span>
    </div>
  );
}

/** Lives inside `<Elements>` — `useStripe`/`useElements` only resolve within that provider. */
export function UpdateCardForm() {
  const t = useTranslations("settings.billing.manageDialog.card");
  const { data: subscription } = useSubscription();
  const stripe = useStripe();
  const elements = useElements();
  const createSetupIntentMutation = useCreateSetupIntent();
  const setDefaultPaymentMethodMutation = useSetDefaultPaymentMethod();
  const [error, setError] = useState<string | null>(null);
  const [succeeded, setSucceeded] = useState(false);
  const [focused, setFocused] = useState(false);

  const isSubmitting =
    createSetupIntentMutation.isPending || setDefaultPaymentMethodMutation.isPending;
  // Synchronous re-entrancy guard — `isSubmitting` above only flips true after a React state
  // update round-trip, so a fast double-click (or Enter-key repeat) landing inside the same task
  // could otherwise call this twice before either mutation's `isPending` re-renders the disabled
  // button, creating two SetupIntents and racing to set the default payment method twice. Mirrors
  // the dummy-checkout page's own `hasStarted` ref guard.
  const submitInFlight = useRef(false);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!stripe || !elements) return;
    if (submitInFlight.current) return;

    const cardElement = elements.getElement(CardElement);
    if (!cardElement) return;

    submitInFlight.current = true;
    setError(null);
    setSucceeded(false);

    try {
      const { clientSecret } = await createSetupIntentMutation.mutateAsync();
      const result = await stripe.confirmCardSetup(clientSecret, {
        payment_method: { card: cardElement },
      });

      if (result.error) {
        setError(result.error.message ?? t("genericError"));
        return;
      }

      const paymentMethodId = result.setupIntent.payment_method;
      if (typeof paymentMethodId !== "string") {
        setError(t("genericError"));
        return;
      }

      await setDefaultPaymentMethodMutation.mutateAsync(paymentMethodId);
      cardElement.clear();
      setSucceeded(true);
    } catch {
      setError(t("genericError"));
    } finally {
      submitInFlight.current = false;
    }
  };

  return (
    <form onSubmit={(event) => void handleSubmit(event)} className={PANEL_CLASS}>
      <PanelHeading icon={LuCreditCard}>{t("title")}</PanelHeading>

      {subscription?.paymentMethod ? <CurrentCard paymentMethod={subscription.paymentMethod} /> : null}

      <div className="flex flex-col gap-1.5">
        <Label>{t("label")}</Label>
        <div
          className={cn(
            "border-input dark:bg-input/30 rounded-md border px-3 py-2.5 transition-[color,box-shadow]",
            focused && "border-ring ring-ring/50 ring-[3px]",
          )}>
          <CardElement
            options={CARD_ELEMENT_OPTIONS}
            onChange={() => setError(null)}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
          />
        </div>
        {error ? <InlineNotice tone="destructive">{error}</InlineNotice> : null}
        {succeeded ? <InlineNotice tone="success">{t("success")}</InlineNotice> : null}
      </div>

      <div className="flex items-center justify-between gap-3">
        <Button type="submit" className="w-fit" disabled={!stripe || isSubmitting}>
          <LuSave />
          {isSubmitting ? t("saving") : t("save")}
        </Button>
        <p className="text-muted-foreground flex items-center gap-1 text-[11.5px]">
          <LuLock className="size-3" />
          {t("securedByStripe")}
        </p>
      </div>
    </form>
  );
}
