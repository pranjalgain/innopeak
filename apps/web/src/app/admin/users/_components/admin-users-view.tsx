"use client";

import { AnimatePresence, motion } from "motion/react";
import { useFormatter, useTranslations } from "next-intl";
import { LuSearch, LuUsers } from "react-icons/lu";

import { getInitials } from "@/app/_libs/utils/initials";
import { EmptyState } from "@/components/common/empty-state";
import { LoadErrorState } from "@/components/common/load-error-state";
import { Pagination } from "@/components/common/pagination";
import { RowActionsMenu } from "@/components/common/row-actions-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useAdminUsers } from "@/hooks/admin/use-admin-users";
import { usePagination } from "@/hooks/common/use-pagination";
import { useSearchFilter } from "@/hooks/common/use-search-filter";
import type { AdminUser } from "@/types/domain";

const DATE_FORMAT = { month: "short", day: "numeric", year: "numeric" } as const;

const USER_SEARCH_FIELDS = ["name", "businessName"] as const satisfies readonly (keyof AdminUser)[];

// Same convention as the Businesses screen's own `STATUS_BADGE_CLASSNAME` — `border-transparent`
// plus a semantic `-soft`/`text-*` pair, rather than the ad hoc ternary this file inlined twice.
const STATUS_BADGE_CLASSNAME: Record<"active" | "inactive", string> = {
  active: "border-transparent bg-success-soft text-success",
  inactive: "border-transparent bg-muted text-muted-foreground",
};

const ROLE_BADGE_CLASSNAME: Record<AdminUser["role"], string> = {
  owner: "border-transparent bg-accent text-primary",
  member: "border-transparent bg-muted text-muted-foreground",
};

function AdminUsersSkeleton() {
  return (
    <>
      <div className="hidden flex-col gap-3 overflow-hidden rounded-xl border border-border p-3 xl:flex">
        <Skeleton className="h-11 w-full" />
        <Skeleton className="h-11 w-full" />
        <Skeleton className="h-11 w-full" />
        <Skeleton className="h-11 w-full" />
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:hidden">
        <Skeleton className="h-28 w-full rounded-xl" />
        <Skeleton className="h-28 w-full rounded-xl" />
        <Skeleton className="h-28 w-full rounded-xl" />
        <Skeleton className="h-28 w-full rounded-xl" />
      </div>
    </>
  );
}

function AdminUsersEmptyState() {
  const t = useTranslations("adminUsers.emptyState");

  return <EmptyState icon={LuUsers} title={t("title")} description={t("description")} />;
}

function AdminUsersNoResults({ onClearSearch }: { onClearSearch: () => void }) {
  const t = useTranslations("adminUsers.noResults");

  return (
    <EmptyState
      icon={LuSearch}
      title={t("title")}
      description={t("description")}
      action={{ label: t("clearSearch"), onClick: onClearSearch }}
    />
  );
}

interface UserActionsMenuProps {
  user: AdminUser;
  onToggleActive: (id: string) => void;
}

// See `RowActionsMenu`'s own comment for why the confirm dialog is a sibling of `DropdownMenu`
// rather than nested inside `DropdownMenuContent`.
function UserActionsMenu({ user, onToggleActive }: UserActionsMenuProps) {
  const t = useTranslations("adminUsers");

  return (
    <RowActionsMenu
      ariaLabel={t("columns.actions")}
      actionLabel={user.isActive ? t("deactivate") : t("activate")}
      actionVariant={user.isActive ? "destructive" : "default"}
      confirmTitle={
        user.isActive
          ? t("confirmDeactivate.title", { name: user.name })
          : t("confirmActivate.title", { name: user.name })
      }
      confirmDescription={user.isActive ? t("confirmDeactivate.description") : t("confirmActivate.description")}
      confirmLabel={user.isActive ? t("deactivate") : t("activate")}
      cancelLabel={t("cancel")}
      destructive={user.isActive}
      onConfirm={() => onToggleActive(user.id)}
    />
  );
}

export function AdminUsersView() {
  const t = useTranslations("adminUsers");
  const tRole = useTranslations("adminUsers.role");
  const tStatus = useTranslations("adminUsers.status");
  const format = useFormatter();
  const { users, isLoading, isError, refetch, toggleActive } = useAdminUsers();
  const { search, setSearch, filtered } = useSearchFilter(users, USER_SEARCH_FIELDS);

  const { page, totalPages, pageItems, goToPreviousPage, goToNextPage } = usePagination(filtered, 10);

  const toggle = (id: string) => void toggleActive(id);

  return (
    <div className="flex min-h-full flex-col gap-6 p-fluid-page">
      {isLoading || isError || users.length === 0 ? null : (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted-foreground">{t("resultCount", { count: filtered.length })}</p>
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
        <AdminUsersSkeleton />
      ) : isError ? (
        <LoadErrorState onRetry={refetch} />
      ) : users.length === 0 ? (
        <AdminUsersEmptyState />
      ) : filtered.length === 0 ? (
        <AdminUsersNoResults onClearSearch={() => setSearch("")} />
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
                  <TableHead className="w-48">{t("columns.business")}</TableHead>
                  <TableHead className="w-28">{t("columns.role")}</TableHead>
                  <TableHead className="w-28">{t("columns.status")}</TableHead>
                  <TableHead className="w-32">{t("columns.lastLogin")}</TableHead>
                  <TableHead className="w-28 text-right">{t("columns.actions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <AnimatePresence initial={false}>
                  {pageItems.map((user) => (
                    // Plain `motion.tr` rather than `motion.create(TableRow)` — `TableRow` doesn't
                    // forward a ref, which Motion needs to apply layout transforms, so this inlines
                    // that primitive's own row styling instead of wrapping it.
                    <motion.tr
                      key={user.id}
                      layout
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.2, ease: "easeOut" }}
                      className="hover:bg-muted/50 data-[state=selected]:bg-muted border-b transition-colors"
                    >
                      <TableCell className="truncate">
                        <div className="flex items-center gap-2.5">
                          <Avatar className="size-7 shrink-0">
                            <AvatarFallback className="bg-accent text-[11px] font-medium text-accent-foreground">
                              {getInitials(user.name)}
                            </AvatarFallback>
                          </Avatar>
                          <p className="min-w-0 truncate text-sm font-medium">{user.name}</p>
                        </div>
                      </TableCell>
                      <TableCell className="truncate text-muted-foreground">{user.businessName}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={ROLE_BADGE_CLASSNAME[user.role]}>
                          {tRole(user.role)}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={STATUS_BADGE_CLASSNAME[user.isActive ? "active" : "inactive"]}
                        >
                          {tStatus(user.isActive ? "active" : "inactive")}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {user.lastLoginAt ? format.dateTime(new Date(user.lastLoginAt), DATE_FORMAT) : t("neverLoggedIn")}
                      </TableCell>
                      <TableCell className="text-right">
                        <UserActionsMenu user={user} onToggleActive={toggle} />
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
              {pageItems.map((user) => (
                <motion.div
                  key={user.id}
                  layout
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.2, ease: "easeOut" }}
                  className="flex flex-col gap-2.5 rounded-xl border border-border bg-card p-4 shadow-elevated"
                >
                  <div className="flex items-center gap-2.5">
                    <Avatar className="size-8 shrink-0">
                      <AvatarFallback className="bg-accent text-xs font-medium text-accent-foreground">
                        {getInitials(user.name)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">{user.name}</p>
                      <p className="truncate text-[13px] text-muted-foreground">{user.businessName}</p>
                    </div>
                    <Badge
                      variant="outline"
                      className={STATUS_BADGE_CLASSNAME[user.isActive ? "active" : "inactive"]}
                    >
                      {tStatus(user.isActive ? "active" : "inactive")}
                    </Badge>
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5">
                    <Badge variant="outline" className={ROLE_BADGE_CLASSNAME[user.role]}>
                      {tRole(user.role)}
                    </Badge>
                  </div>

                  <div className="flex items-center justify-between border-t border-border pt-2.5 text-[13px]">
                    <span className="text-muted-foreground">{t("columns.lastLogin")}</span>
                    <span>
                      {user.lastLoginAt ? format.dateTime(new Date(user.lastLoginAt), DATE_FORMAT) : t("neverLoggedIn")}
                    </span>
                  </div>

                  <div className="mt-1 flex justify-end">
                    <UserActionsMenu user={user} onToggleActive={toggle} />
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
