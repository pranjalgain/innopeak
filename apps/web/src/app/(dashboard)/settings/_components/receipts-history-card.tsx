import { useFormatter, useTranslations } from "next-intl";
import { LuDownload, LuReceipt } from "react-icons/lu";
import { toast } from "sonner";

import { DATE_FORMAT } from "@/app/_libs/utils/date";
import { formatCurrency } from "@/app/_libs/utils/math";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useDownloadReceiptPdf } from "@/hooks/billing/use-download-receipt-pdf";
import type { Receipt } from "@/types/domain";

/** `amountPaid` is in the smallest currency unit; dividing by 100 assumes a 2-decimal currency, as on the backend. */
function formatReceiptAmount(amountPaid: number, currency: string): string {
  return formatCurrency(amountPaid / 100, currency.toUpperCase());
}

/** Stripe-only: a Dummy tenant has no real charge to document. */
export function ReceiptsHistoryCard({ receipts }: { receipts: Receipt[] }) {
  const t = useTranslations("settings.billing.receipts");
  const tToasts = useTranslations("settings.billing.toasts");
  const format = useFormatter();
  const downloadMutation = useDownloadReceiptPdf();

  return (
    <Card className="animate-in fade-in slide-in-from-bottom-2 fill-mode-backwards ease-fluid motion-reduce:animate-none duration-500">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <LuReceipt className="text-primary size-4" />
          {t("title")}
        </CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {receipts.map((receipt) => (
          <div
            key={receipt.id}
            className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-3 last:border-b-0 last:pb-0">
            <div className="flex flex-col gap-0.5">
              <span className="text-sm font-medium">
                {formatReceiptAmount(receipt.amountPaid, receipt.currency)}
              </span>
              <span className="text-muted-foreground text-[12.5px]">
                {format.dateTime(new Date(receipt.paidAt), DATE_FORMAT)}
                {receipt.invoiceNumber ? ` · ${receipt.invoiceNumber}` : ""}
              </span>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={downloadMutation.isPending && downloadMutation.variables === receipt.id}
              onClick={() => {
                downloadMutation.mutate(receipt.id, {
                  onError: () => toast.error(tToasts("receiptDownloadFailed")),
                });
              }}>
              <LuDownload />
              {t("download")}
            </Button>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
