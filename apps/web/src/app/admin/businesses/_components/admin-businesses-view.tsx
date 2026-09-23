"use client";

import { AnimatePresence, motion } from "motion/react";
import { useFormatter, useTranslations } from "next-intl";
import { LuBuilding2, LuSearch } from "react-icons/lu";

import { cn } from "@/app/_libs/utils/cn";
import { EmptyState } from "@/components/common/empty-state";
import { LoadErrorState } from "@/components/common/load-error-state";
import { Pagination } from "@/components/common/pagination";
import { RowActionsMenu } from "@/components/common/row-actions-menu";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useAdminBusinesses } from "@/hooks/admin/use-admin-businesses";
import { usePagination } from "@/hooks/common/use-pagination";
import { useSearchFilter } from "@/hooks/common/use-search-filter";
import type { AdminBusiness, BusinessStatus } from "@/types/domain";

const DATE_FORMAT = { month: "short", day: "numeric", year: "numeric" } as const;

const BUSINESS_SEARCH_FIELDS = ["name", "ownerName"] as const satisfies readonly (keyof AdminBusiness)[];

const STATUS_BADGE_CLASSNAME: Record<BusinessStatus, string> = {
  active: "border-transparent bg-success-soft text-success",
  suspended: "border-transparent bg-destructive-soft text-destructive",
};

function AdminBusinessesSkeleton() {
  return (
    <>
      <div className="hidden flex-col gap-3 overflow-hidden rounded-xl border border-border p-3 xl:flex">
        <Skeleton className="h-11 w-full" />
        <Skeleton className="h-11 w-full" />
        <Skeleton className="h-11 w-full" />
        <Skeleton className="h-11 w-full" />
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:hidden">
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

  return <EmptyState icon={LuBuilding2} title={t("title")} description={t("description")} />;
}

function AdminBusinessesNoResults({ onClearSearch }: { onClearSearch: () => void }) {
  const t = useTranslations("adminBusinesses.noResults");

  return (
    <EmptyState
      icon={LuSearch}
      title={t("title")}
      description={t("description")}
      action={{ label: t("clearSearch"), onClick: onClearSearch }}
    />
  );
}

interface BusinessActionsMenuProps {
  business: AdminBusiness;
  onSuspend: (id: string) => void;
  onReactivate: (id: string) => void;
}

// See `RowActionsMenu`'s own comment for why the confirm dialog is a sibling of `DropdownMenu`
// rather than nested inside `DropdownMenuContent`.
function BusinessActionsMenu({ business, onSuspend, onReactivate }: BusinessActionsMenuProps) {
  const t = useTranslations("adminBusinesses");
  const isActive = business.status === "active";

  return (
    <RowActionsMenu
      ariaLabel={t("columns.actions")}
      actionLabel={isActive ? t("suspend") : t("reactivate")}
      actionVariant={isActive ? "destructive" : "default"}
      confirmTitle={
        isActive
          ? t("confirmSuspend.title", { name: business.name })
          : t("confirmReactivate.title", { name: business.name })
      }
      confirmDescription={isActive ? t("confirmSuspend.description") : t("confirmReactivate.description")}
      confirmLabel={isActive ? t("suspend") : t("reactivate")}
      cancelLabel={t("cancel")}
      destructive={isActive}
      onConfirm={() => (isActive ? onSuspend(business.id) : onReactivate(business.id))}
    />
  );
}

export function AdminBusinessesView() {
  const t = useTranslations("adminBusinesses");
  const tStatus = useTranslations("adminBusinesses.status");
  const format = useFormatter();
  const { businesses, isLoading, isError, refetch, suspendBusiness, reactivateBusiness } =
    useAdminBusinesses();
  const { search, setSearch, filtered } = useSearchFilter(businesses, BUSINESS_SEARCH_FIELDS);

  const { page, totalPages, pageItems, goToPreviousPage, goToNextPage } = usePagination(filtered, 10);

  const suspend = (id: string) => void suspendBusiness(id);
  const reactivate = (id: string) => void reactivateBusiness(id);

  return (
    <div className="flex min-h-full flex-col gap-6 p-fluid-page">
      {isLoading || isError || businesses.length === 0 ? null : (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted-foreground">
            {t("resultCount", { count: filtered.length })}
          </p>
          <div className="relative w-full sm:max-w-[280px]">
            <LuSearch className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="text"
              placeholder={t("searchPlaceholder")}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="h-9 pl-8 text-[13px]"
            />
          </div>
        </div>
      )}

      {isLoading ? (
        <AdminBusinessesSkeleton />
      ) : isError ? (
        <LoadErrorState onRetry={refetch} />
      ) : businesses.length === 0 ? (
        <AdminBusinessesEmptyState />
      ) : filtered.length === 0 ? (
        <AdminBusinessesNoResults onClearSearch={() => setSearch("")} />
      ) : (
        <>
          {/* Desktop layout, `table-fixed` at `min-w-[820px]`. Held back to `xl:` (not `lg:`): at
              `lg:` the icon-rail sidebar still only leaves ~715px of content width — less than
              the table needs — which forced a horizontal scrollbar on every `lg:` screen. `xl:`
              is the first breakpoint with enough room (~964px) to render it without one. */}
          <div className="hidden overflow-hidden rounded-xl border border-border bg-card shadow-elevated xl:block">
            <Table className="min-w-[820px] table-fixed">
              <TableHeader>
                <TableRow className="bg-muted/55 hover:bg-muted/55">
                  <TableHead>{t("columns.name")}</TableHead>
                  <TableHead className="w-32">{t("columns.status")}</TableHead>
                  <TableHead className="w-44">{t("columns.owner")}</TableHead>
                  <TableHead className="w-24">{t("columns.users")}</TableHead>
                  <TableHead className="w-28">{t("columns.created")}</TableHead>
                  <TableHead className="w-28 text-right">{t("columns.actions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <AnimatePresence initial={false}>
                  {pageItems.map((business) => (
                    // Plain `motion.tr` rather than `motion.create(TableRow)` — `TableRow` doesn't
                    // forward a ref, which Motion needs to apply layout transforms, so this inlines
                    // that primitive's own row styling instead of wrapping it.
                    <motion.tr
                      key={business.id}
                      layout
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.2, ease: "easeOut" }}
                      className="hover:bg-muted/50 data-[state=selected]:bg-muted border-b transition-colors"
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
                        {format.dateTime(new Date(business.createdAt), DATE_FORMAT)}
                      </TableCell>
                      <TableCell className="text-right">
                        <BusinessActionsMenu business={business} onSuspend={suspend} onReactivate={reactivate} />
                      </TableCell>
                    </motion.tr>
                  ))}
                </AnimatePresence>
              </TableBody>
            </Table>
          </div>

          {/* Tablet/mobile layout — stacked cards, same pattern as `ReviewCardList`. */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:hidden">
            <AnimatePresence initial={false}>
              {pageItems.map((business) => (
                <motion.div
                  key={business.id}
                  layout
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.2, ease: "easeOut" }}
                  className="flex flex-col gap-2.5 rounded-xl border border-border bg-card p-4 shadow-elevated"
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
                    <span>{format.dateTime(new Date(business.createdAt), DATE_FORMAT)}</span>
                  </div>

                  <div className="mt-1 flex justify-end">
                    <BusinessActionsMenu business={business} onSuspend={suspend} onReactivate={reactivate} />
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>

          <div className="mt-auto">
            <Pagination page={page} totalPages={totalPages} onPrevious={goToPreviousPage} onNext={goToNextPage} />
          </div>
        </>
      )}
    </div>
  );
}
