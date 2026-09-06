"use client";

import { useTranslations } from "next-intl";
import * as React from "react";
import { LuSend, LuUsers } from "react-icons/lu";

import { cn } from "@/app/_libs/utils/cn";
import { getInitials } from "@/app/_libs/utils/initials";
import { ConfirmActionDialog } from "@/components/common/confirm-action-dialog";
import { Pagination } from "@/components/common/pagination";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { usePagination } from "@/hooks/common/use-pagination";
import { useTenantMembers } from "@/hooks/settings/use-tenant-members";
import type { MemberStatus } from "@/types/domain";

const STATUS_BADGE_CLASSNAME: Record<MemberStatus, string> = {
  active: "border-transparent bg-success-soft text-success",
  invited: "border-transparent bg-warning-soft text-warning",
  pending_verification: "border-transparent bg-warning-soft text-warning",
  disabled: "border-transparent bg-muted text-muted-foreground",
};

/** Only reachable while `FEATURE_FLAGS.inviteMembers` is enabled. */
export function MembersSettingsSection() {
  const t = useTranslations("settings.members");
  const tRole = useTranslations("settings.members.role");
  const tStatus = useTranslations("settings.members.status");
  const { members, isLoading, inviteMember, revokeInvite } = useTenantMembers();
  const [email, setEmail] = React.useState("");
  const { page, totalPages, pageItems, goToPreviousPage, goToNextPage } = usePagination(members, 10);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!email.trim()) return;
    const succeeded = await inviteMember(email.trim());
    if (succeeded) setEmail("");
  };

  if (isLoading) return <Skeleton className="h-56 w-full max-w-3xl rounded-xl" />;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <form className="flex gap-2.5" onSubmit={(e) => void handleSubmit(e)}>
          <Input
            type="email"
            placeholder={t("emailPlaceholder")}
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="flex-1"
          />
          <Button type="submit" disabled={!email.trim()}>
            <LuSend />
            {t("inviteButton")}
          </Button>
        </form>

        {members.length === 0 ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <LuUsers className="size-4" />
            {t("empty")}
          </p>
        ) : (
          <div className="flex flex-col">
            {pageItems.map((member, index) => (
              <div
                key={member.id}
                className={cn(
                  "flex flex-wrap items-center justify-between gap-3 py-3",
                  index !== pageItems.length - 1 && "border-b border-border",
                )}
              >
                <div className="flex min-w-0 items-center gap-2.5">
                  <Avatar className="size-8 shrink-0">
                    <AvatarFallback className="bg-accent text-xs font-medium text-accent-foreground">
                      {getInitials(member.name)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{member.name}</p>
                    <p className="truncate text-[13px] text-muted-foreground">{member.email}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline">{tRole(member.role)}</Badge>
                  <Badge variant="outline" className={STATUS_BADGE_CLASSNAME[member.status]}>
                    {tStatus(member.status)}
                  </Badge>
                  {member.status === "invited" ? (
                    <ConfirmActionDialog
                      trigger={
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="border-destructive text-destructive hover:bg-destructive/10"
                        >
                          {t("revoke")}
                        </Button>
                      }
                      title={t("confirmRevoke.title", { name: member.name })}
                      description={t("confirmRevoke.description")}
                      confirmLabel={t("revoke")}
                      cancelLabel={t("cancel")}
                      destructive
                      onConfirm={() => void revokeInvite(member.id)}
                    />
                  ) : null}
                </div>
              </div>
            ))}
            <Pagination page={page} totalPages={totalPages} onPrevious={goToPreviousPage} onNext={goToNextPage} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
