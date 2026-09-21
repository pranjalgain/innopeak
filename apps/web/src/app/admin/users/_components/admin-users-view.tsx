"use client";

import { useFormatter, useTranslations } from "next-intl";
import { LuUsers } from "react-icons/lu";

import { cn } from "@/app/_libs/utils/cn";
import { getInitials } from "@/app/_libs/utils/initials";
import { ConfirmActionDialog } from "@/components/common/confirm-action-dialog";
import { LoadErrorState } from "@/components/common/load-error-state";
import { Pagination } from "@/components/common/pagination";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useAdminUsers } from "@/hooks/admin/use-admin-users";
import { usePagination } from "@/hooks/common/use-pagination";
import type { AdminUser } from "@/types/domain";

const DATE_FORMAT = { month: "short", day: "numeric", year: "numeric" } as const;

function AdminUsersSkeleton() {
  return (
    <>
      <div className="hidden flex-col gap-3 overflow-hidden rounded-xl border border-border p-3 lg:flex">
        <Skeleton className="h-11 w-full" />
        <Skeleton className="h-11 w-full" />
        <Skeleton className="h-11 w-full" />
        <Skeleton className="h-11 w-full" />
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:hidden">
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

  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-border bg-card px-6 py-12 text-center shadow-elevated">
      <LuUsers className="size-7 text-muted-foreground" />
      <p className="text-sm font-medium">{t("title")}</p>
      <p className="text-[13px] text-muted-foreground">{t("description")}</p>
    </div>
  );
}

interface UserActionButtonProps {
  user: AdminUser;
  onToggleActive: (id: string) => void;
  className?: string;
}

function UserActionButton({ user, onToggleActive, className }: UserActionButtonProps) {
  const t = useTranslations("adminUsers");

  if (user.isActive) {
    return (
      <ConfirmActionDialog
        trigger={
          <Button
            type="button"
            variant="outline"
            size="sm"
            className={cn("border-destructive text-destructive hover:bg-destructive/10", className)}
          >
            {t("deactivate")}
          </Button>
        }
        title={t("confirmDeactivate.title", { name: user.name })}
        description={t("confirmDeactivate.description")}
        confirmLabel={t("deactivate")}
        cancelLabel={t("cancel")}
        destructive
        onConfirm={() => onToggleActive(user.id)}
      />
    );
  }

  return (
    <ConfirmActionDialog
      trigger={
        <Button type="button" variant="outline" size="sm" className={className}>
          {t("activate")}
        </Button>
      }
      title={t("confirmActivate.title", { name: user.name })}
      description={t("confirmActivate.description")}
      confirmLabel={t("activate")}
      cancelLabel={t("cancel")}
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
  const { page, totalPages, pageItems, goToPreviousPage, goToNextPage } = usePagination(users, 10);

  const toggle = (id: string) => void toggleActive(id);

  return (
    <div className="flex min-h-full flex-col gap-6 p-fluid-page">
      {/* See the Businesses screen's twin comment — a count rendered during load or after a
          failure reads as a real answer of zero. */}
      {isLoading || isError ? null : (
        <p className="text-sm text-muted-foreground">{t("resultCount", { count: users.length })}</p>
      )}

      {isLoading ? (
        <AdminUsersSkeleton />
      ) : isError ? (
        <LoadErrorState onRetry={refetch} />
      ) : users.length === 0 ? (
        <AdminUsersEmptyState />
      ) : (
        <>
          {/* Desktop layout — horizontally-scrollable fixed-width table. Held back to `lg:` (not `md:`) since the icon-rail sidebar at tablet widths leaves too little room. */}
          <div className="hidden overflow-hidden rounded-xl border border-border bg-card shadow-elevated lg:block">
            <Table className="min-w-[820px] table-fixed">
              <TableHeader>
                <TableRow className="bg-muted/55 hover:bg-muted/55">
                  <TableHead>{t("columns.name")}</TableHead>
                  <TableHead className="w-48">{t("columns.business")}</TableHead>
                  <TableHead className="w-28">{t("columns.role")}</TableHead>
                  <TableHead className="w-28">{t("columns.status")}</TableHead>
                  <TableHead className="w-32">{t("columns.lastLogin")}</TableHead>
                  <TableHead className="w-32 text-right">{t("columns.actions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pageItems.map((user, index) => (
                  <TableRow
                    key={user.id}
                    className="animate-in fade-in slide-in-from-bottom-1 fill-mode-backwards duration-300 ease-fluid"
                    style={{ animationDelay: `${Math.min(index, 8) * 40}ms` }}
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
                      <Badge variant="outline">{tRole(user.role)}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={
                          user.isActive
                            ? "border-transparent bg-success-soft text-success"
                            : "border-transparent bg-muted text-muted-foreground"
                        }
                      >
                        {tStatus(user.isActive ? "active" : "inactive")}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {user.lastLoginAt ? format.dateTime(new Date(user.lastLoginAt), DATE_FORMAT) : t("neverLoggedIn")}
                    </TableCell>
                    <TableCell className="text-right">
                      <UserActionButton user={user} onToggleActive={toggle} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Tablet/mobile layout — stacked cards, same pattern as `ReviewCardList`. */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:hidden">
            {pageItems.map((user, index) => (
              <div
                key={user.id}
                className="animate-in fade-in slide-in-from-bottom-2 fill-mode-backwards flex flex-col gap-2.5 rounded-xl border border-border bg-card p-4 shadow-elevated duration-500 ease-fluid"
                style={{ animationDelay: `${Math.min(index, 8) * 50}ms` }}
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
                    className={
                      user.isActive
                        ? "border-transparent bg-success-soft text-success"
                        : "border-transparent bg-muted text-muted-foreground"
                    }
                  >
                    {tStatus(user.isActive ? "active" : "inactive")}
                  </Badge>
                </div>

                <div className="flex flex-wrap items-center gap-1.5">
                  <Badge variant="outline">{tRole(user.role)}</Badge>
                </div>

                <div className="flex items-center justify-between border-t border-border pt-2.5 text-[13px]">
                  <span className="text-muted-foreground">{t("columns.lastLogin")}</span>
                  <span>
                    {user.lastLoginAt ? format.dateTime(new Date(user.lastLoginAt), DATE_FORMAT) : t("neverLoggedIn")}
                  </span>
                </div>

                <div className="mt-1 flex justify-end">
                  <UserActionButton user={user} onToggleActive={toggle} />
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
