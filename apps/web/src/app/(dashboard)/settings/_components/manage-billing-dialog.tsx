"use client";

import { Elements } from "@stripe/react-stripe-js";
import { useTranslations } from "next-intl";
import { useMemo } from "react";
import { LuCreditCard } from "react-icons/lu";

import { PANEL_CLASS, PanelHeading } from "@/app/(dashboard)/settings/_components/billing-panel";
import { BillingProfileForm } from "@/app/(dashboard)/settings/_components/billing-profile-form";
import { UpdateCardForm } from "@/app/(dashboard)/settings/_components/update-card-form";
import { getStripe, isStripeConfigured } from "@/app/_libs/stripe/get-stripe";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface ManageBillingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Stripe-only in-app billing dialog (Dummy tenants keep the portal redirect). The card uses Elements + a SetupIntent so the raw number never reaches our backend (PCI SAQ A). */
export function ManageBillingDialog({ open, onOpenChange }: ManageBillingDialogProps) {
  const t = useTranslations("settings.billing.manageDialog");
  const stripePromise = useMemo(() => getStripe(), []);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <LuCreditCard className="text-primary size-4" />
            {t("title")}
          </DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <BillingProfileForm />

          {isStripeConfigured() ? (
            <Elements stripe={stripePromise}>
              <UpdateCardForm />
            </Elements>
          ) : (
            <div className={PANEL_CLASS}>
              <PanelHeading icon={LuCreditCard}>{t("card.title")}</PanelHeading>
              <p className="text-muted-foreground text-[13px]">{t("cardUnavailable")}</p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
