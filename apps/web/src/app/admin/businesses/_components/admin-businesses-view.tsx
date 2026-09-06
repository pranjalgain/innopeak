"use client";

import { useTranslations } from "next-intl";
import { LuBuilding2 } from "react-icons/lu";

import { cn } from "@/app/_libs/utils/cn";
import { ConfirmActionDialog } from "@/components/common/confirm-action-dialog";
import { Pagination } from "@/components/common/pagination";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useAdminBusinesses } from "@/hooks/admin/use-admin-businesses";
import { usePagination } from "@/hooks/common/use-pagination";
import type { AdminBusiness, BusinessStatus } from "@/types/domain";

const DATE_FORMATTER = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" });

const STATUS_BADGE_CLASSNAME: Record<BusinessStatus, string> = {
  active: "border-transparent bg-success-soft text-success",
  suspended: "border-transparent bg-destructive-soft text-destructive",
};

function AdminBusinessesSkeleton() {
  return (
    <>
      <div className="hidden flex-col gap-3 overflow-hidden rounded-xl border border-border p-3 lg:flex">
        <Skeleton className="h-11 w-full" />
        <Skeleton className="h-11 w-full" />
        <Skeleton className="h-11 w-full" />
        <Skeleton className="h-11 w-full" />
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:hidden">
        <Skeleton className="h-32 w-full rounded-xl" />
        <Skeleton className="h-32 w-full rounded-xl" />
        <Skeleton className="h-32 w-full rounded-xl" />
        <Skeleton className="h-32 w-full rounded-xl" />
      </div>
    </>
  );
}

function AdminBusinessesEmptyState() {
  const t = useTranslations("adminBusinesses.emptyState");

  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-border bg-card px-6 py-12 text-center shadow-elevated">
      <LuBuilding2 className="size-7 text-muted-foreground" />
      <p className="text-sm font-medium">{t("title")}</p>
      <p className="text-[13px] text-muted-foreground">{t("description")}</p>
    </div>
  );
}

interface BusinessActionButtonProps {
  business: AdminBusiness;
  onSuspend: (id: string) => void;
  onReactivate: (id: string) => void;
  className?: string;
}

function BusinessActionButton({ business, onSuspend, onReactivate, className }: BusinessActionButtonProps) {
  const t = useTranslations("adminBusinesses");

  if (business.status === "active") {
    return (
      <ConfirmActionDialog
        trigger={
          <Button
            type="button"
            variant="outline"
            size="sm"
            className={cn("border-destructive text-destructive hover:bg-destructive/10", className)}
          >
            {t("suspend")}
          </Button>
        }
        title={t("confirmSuspend.title", { name: business.name })}
        description={t("confirmSuspend.description")}
        confirmLabel={t("suspend")}
        cancelLabel={t("cancel")}
        destructive
        onConfirm={() => onSuspend(business.id)}
      />
    );
  }

  return (
    <ConfirmActionDialog
      trigger={
        <Button type="button" variant="outline" size="sm" className={className}>
          {t("reactivate")}
        </Button>
      }
      title={t("confirmReactivate.title", { name: business.name })}
      description={t("confirmReactivate.description")}
      confirmLabel={t("reactivate")}
      cancelLabel={t("cancel")}
      onConfirm={() => onReactivate(business.id)}
    />
  );
}

export function AdminBusinessesView() {
  const t = useTranslations("adminBusinesses");
  const tStatus = useTranslations("adminBusinesses.status");
  const { businesses, isLoading, suspendBusiness, reactivateBusiness } = useAdminBusinesses();
  const { page, totalPages, pageItems, goToPreviousPage, goToNextPage } = usePagination(businesses, 10);

  const suspend = (id: string) => void suspendBusiness(id);
  const reactivate = (id: string) => void reactivateBusiness(id);

  return (
    <div className="flex min-h-full flex-col gap-6 p-fluid-page">
      <p className="text-sm text-muted-foreground">{t("resultCount", { count: businesses.length })}</p>

      {isLoading ? (
        <AdminBusinessesSkeleton />
      ) : businesses.length === 0 ? (
        <AdminBusinessesEmptyState />
      ) : (
        <>
          {/* Desktop layout — horizontally-scrollable fixed-width table. Held back to `lg:` (not `md:`) since the icon-rail sidebar at tablet widths leaves too little room. */}
          <div className="hidden overflow-hidden rounded-xl border border-border bg-card shadow-elevated lg:block">
            <Table className="min-w-[820px] table-fixed">
              <TableHeader>
                <TableRow className="bg-muted/55 hover:bg-muted/55">
                  <TableHead>{t("columns.name")}</TableHead>
                  <TableHead className="w-32">{t("columns.status")}</TableHead>
                  <TableHead className="w-44">{t("columns.owner")}</TableHead>
                  <TableHead className="w-24">{t("columns.users")}</TableHead>
                  <TableHead className="w-28">{t("columns.created")}</TableHead>
                  <TableHead className="w-32 text-right">{t("columns.actions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pageItems.map((business, index) => (
                  <TableRow
                    key={business.id}
                    className="animate-in fade-in slide-in-from-bottom-1 fill-mode-backwards duration-300 ease-fluid"
                    style={{ animationDelay: `${Math.min(index, 8) * 40}ms` }}
                  >
                    <TableCell className="font-medium whitespace-normal">{business.name}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={STATUS_BADGE_CLASSNAME[business.status]}>
                        {tStatus(business.status)}
                      </Badge>
                    </TableCell>
                    <TableCell className="truncate text-muted-foreground">{business.ownerName}</TableCell>
                    <TableCell>{business.userCount}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {DATE_FORMATTER.format(new Date(business.createdAt))}
                    </TableCell>
                    <TableCell className="text-right">
                      <BusinessActionButton business={business} onSuspend={suspend} onReactivate={reactivate} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Tablet/mobile layout — stacked cards, same pattern as `ReviewCardList`. */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:hidden">
            {pageItems.map((business, index) => (
              <div
                key={business.id}
                className="animate-in fade-in slide-in-from-bottom-2 fill-mode-backwards flex flex-col gap-2.5 rounded-xl border border-border bg-card p-4 shadow-elevated duration-500 ease-fluid"
                style={{ animationDelay: `${Math.min(index, 8) * 50}ms` }}
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="text-sm font-semibold break-words">{business.name}</span>
                  <Badge variant="outline" className={cn(STATUS_BADGE_CLASSNAME[business.status], "shrink-0")}>
                    {tStatus(business.status)}
                  </Badge>
                </div>

                <p className="text-[13px] text-muted-foreground">{business.ownerName}</p>

                <div className="flex items-center justify-between border-t border-border pt-2.5 text-[13px]">
                  <span className="text-muted-foreground">{t("columns.users")}</span>
                  <span>{business.userCount}</span>
                </div>
                <div className="flex items-center justify-between text-[13px]">
                  <span className="text-muted-foreground">{t("columns.created")}</span>
                  <span>{DATE_FORMATTER.format(new Date(business.createdAt))}</span>
                </div>

                <div className="mt-1 flex justify-end">
                  <BusinessActionButton business={business} onSuspend={suspend} onReactivate={reactivate} />
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
