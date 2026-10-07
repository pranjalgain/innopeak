import { useFormatter, useTranslations } from "next-intl";
import { useState } from "react";
import { LuTriangleAlert } from "react-icons/lu";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { PostErasureCharge } from "@/types/domain";

interface PostErasureChargesPanelProps {
  /** Payments taken after the business asked to be deleted and not yet handled, newest first. */
  charges: PostErasureCharge[];
  onResolve: (receiptId: string) => Promise<boolean>;
}

/** Marking handled only clears the entry; the admin refunds in Stripe themselves, and this never touches Stripe. */
export function PostErasureChargesPanel({ charges, onResolve }: PostErasureChargesPanelProps) {
  const t = useTranslations("adminBilling.postErasureCharges");
  const format = useFormatter();
  const [resolving, setResolving] = useState<string | null>(null);

  const handle = async (receiptId: string) => {
    setResolving(receiptId);
    try {
      await onResolve(receiptId);
    } finally {
      setResolving(null);
    }
  };

  return (
    <Card className="border-destructive/40">
      <CardHeader>
        <CardTitle className="text-destructive flex items-center gap-2">
          <LuTriangleAlert className="size-4" />
          {t("title")}
        </CardTitle>
        <CardDescription>{t("subtitle")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-1">
        {charges.map((charge) => (
          <div
            key={charge.receiptId}
            className="flex flex-wrap items-center justify-between gap-3 py-1.5">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{charge.businessName}</p>
              <p className="text-muted-foreground truncate text-[13px]">
                {t("detail", {
                  invoice: charge.invoiceNumber ?? t("noInvoiceNumber"),
                  amount: format.number(charge.amountPaid / 100, {
                    style: "currency",
                    currency: charge.currency.toUpperCase(),
                  }),
                  date: format.dateTime(new Date(charge.paidAt), { dateStyle: "medium" }),
                })}
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={resolving !== null}
              onClick={() => void handle(charge.receiptId)}>
              {resolving === charge.receiptId ? t("resolving") : t("resolve")}
            </Button>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
