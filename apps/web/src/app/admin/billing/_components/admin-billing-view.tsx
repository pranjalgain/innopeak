"use client";

import { useTranslations } from "next-intl";
import { LuCreditCard } from "react-icons/lu";

import { Pagination } from "@/components/common/pagination";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useAdminBilling } from "@/hooks/admin/use-admin-billing";
import { usePagination } from "@/hooks/common/use-pagination";
import type { BusinessStatus } from "@/types/domain";

const CURRENCY_FORMATTER = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

const STATUS_BADGE_CLASSNAME: Record<BusinessStatus, string> = {
  active: "border-transparent bg-success-soft text-success",
  suspended: "border-transparent bg-destructive-soft text-destructive",
};

function AdminBillingSkeleton() {
  return (
    <>
      <div className="hidden flex-col gap-3 overflow-hidden rounded-xl border border-border p-3 lg:flex">
        <Skeleton className="h-11 w-full" />
        <Skeleton className="h-11 w-full" />
        <Skeleton className="h-11 w-full" />
        <Skeleton className="h-11 w-full" />
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:hidden">
        <Skeleton className="h-24 w-full rounded-xl" />
        <Skeleton className="h-24 w-full rounded-xl" />
        <Skeleton className="h-24 w-full rounded-xl" />
        <Skeleton className="h-24 w-full rounded-xl" />
      </div>
    </>
  );
}

function AdminBillingEmptyState() {
  const t = useTranslations("adminBilling.emptyState");

  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-border bg-card px-6 py-12 text-center shadow-elevated">
      <LuCreditCard className="size-7 text-muted-foreground" />
      <p className="text-sm font-medium">{t("title")}</p>
      <p className="text-[13px] text-muted-foreground">{t("description")}</p>
    </div>
  );
}

export function AdminBillingView() {
  const t = useTranslations("adminBilling");
  const tPlan = useTranslations("adminBusinesses.plan");
  const tStatus = useTranslations("adminBusinesses.status");
  const { billing, isLoading } = useAdminBilling();
  const { page, totalPages, pageItems, goToPreviousPage, goToNextPage } = usePagination(billing, 4);

  const totalMrr = billing.reduce((sum, row) => sum + row.mrr, 0);

  return (
    <div className="flex min-h-full flex-col gap-6 p-fluid-page">
      <p className="text-sm text-muted-foreground">{t("resultCount", { count: billing.length })}</p>

      {isLoading ? (
        <AdminBillingSkeleton />
      ) : billing.length === 0 ? (
        <AdminBillingEmptyState />
      ) : (
        <>
          <div className="rounded-xl border border-border bg-card p-5 shadow-elevated">
            <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{t("totalMrr")}</p>
            <p className="mt-1 text-2xl font-semibold">{CURRENCY_FORMATTER.format(totalMrr)}</p>
          </div>

          {/* Desktop layout — horizontally-scrollable fixed-width table. Held back to `lg:` (not `md:`) since the icon-rail sidebar at tablet widths leaves too little room. */}
          <div className="hidden overflow-hidden rounded-xl border border-border bg-card shadow-elevated lg:block">
            <Table className="min-w-[720px] table-fixed">
              <TableHeader>
                <TableRow className="bg-muted/55 hover:bg-muted/55">
                  <TableHead>{t("columns.business")}</TableHead>
                  <TableHead className="w-32">{t("columns.plan")}</TableHead>
                  <TableHead className="w-28">{t("columns.mrr")}</TableHead>
                  <TableHead className="w-44">{t("columns.reviewsThisMonth")}</TableHead>
                  <TableHead className="w-32">{t("columns.status")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pageItems.map((row, index) => (
                  <TableRow
                    key={row.businessId}
                    className="animate-in fade-in slide-in-from-bottom-1 fill-mode-backwards duration-300 ease-fluid"
                    style={{ animationDelay: `${Math.min(index, 8) * 40}ms` }}
                  >
                    <TableCell className="truncate font-medium">{row.businessName}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{tPlan(row.plan)}</Badge>
                    </TableCell>
                    <TableCell>{CURRENCY_FORMATTER.format(row.mrr)}</TableCell>
                    <TableCell>{row.reviewsThisMonth}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={STATUS_BADGE_CLASSNAME[row.status]}>
                        {tStatus(row.status)}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Tablet/mobile layout — stacked cards, same pattern as `ReviewCardList`. */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:hidden">
            {pageItems.map((row, index) => (
              <div
                key={row.businessId}
                className="animate-in fade-in slide-in-from-bottom-2 fill-mode-backwards flex flex-col gap-2.5 rounded-xl border border-border bg-card p-4 shadow-elevated duration-500 ease-fluid"
                style={{ animationDelay: `${Math.min(index, 8) * 50}ms` }}
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="text-sm font-semibold break-words">{row.businessName}</span>
                  <Badge variant="outline" className={STATUS_BADGE_CLASSNAME[row.status]}>
                    {tStatus(row.status)}
                  </Badge>
                </div>

                <Badge variant="outline" className="w-fit">
                  {tPlan(row.plan)}
                </Badge>

                <div className="flex items-center justify-between border-t border-border pt-2.5 text-[13px]">
                  <span className="text-muted-foreground">{t("columns.mrr")}</span>
                  <span>{CURRENCY_FORMATTER.format(row.mrr)}</span>
                </div>
                <div className="flex items-center justify-between text-[13px]">
                  <span className="text-muted-foreground">{t("columns.reviewsThisMonth")}</span>
                  <span>{row.reviewsThisMonth}</span>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-auto">
            <Pagination page={page} totalPages={totalPages} onPrevious={goToPreviousPage} onNext={goToNextPage} />
          </div>
        </>
      )}
    </div>
  );
}
