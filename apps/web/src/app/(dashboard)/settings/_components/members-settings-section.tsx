"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";

import { useForm } from "react-hook-form";
import { LuSend, LuUsers } from "react-icons/lu";

import {
  type InviteMemberFields,
  inviteMemberSchema,
} from "@/app/(dashboard)/settings/_schemas/invite-member.schema";
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

/** Only reachable while the platform's inviteMembersEnabled setting is on. */
export function MembersSettingsSection() {
  const t = useTranslations("settings.members");
  const tRole = useTranslations("settings.members.role");
  const tStatus = useTranslations("settings.members.status");
  const { members, isLoading, inviteMember, revokeInvite } = useTenantMembers();
  const { page, totalPages, pageItems, goToPreviousPage, goToNextPage } = usePagination(members, 10);
  const schema = useMemo(() => inviteMemberSchema(t), [t]);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isValid, isSubmitting },
  } = useForm<InviteMemberFields>({
    resolver: zodResolver(schema),
    mode: "onTouched",
    defaultValues: { email: "" },
  });
  // The schema has no separate "required" rule — an empty string simply fails `.email()` — so
  // blurring the field before typing anything (`mode: "onTouched"`) surfaces the same "not a valid
  // email" message a real typo would. That reads as the form nagging someone who hasn't done
  // anything yet; an untouched-but-empty field isn't invalid, it's just not filled in.
  //
  // Mirrored into local state via `register`'s onChange rather than read with `watch()` — same
  // reasoning `ProfileSettingsSection`'s password checklist documents: `watch()` can't be
  // memoized safely and React Compiler skips optimizing the whole component around it.
  const [emailValue, setEmailValue] = useState("");
  const showEmailError = Boolean(errors.email) && emailValue.trim().length > 0;

  // Cleared only on success, so a rejected invite leaves the address in place to correct.
  const submitInvite = handleSubmit(async (values) => {
    const succeeded = await inviteMember(values.email);
    if (succeeded) {
      reset();
      setEmailValue("");
    }
  });

  if (isLoading) return <Skeleton className="h-56 w-full max-w-3xl rounded-xl" />;

  return (
    <Card className="animate-in fade-in slide-in-from-bottom-2 fill-mode-backwards ease-fluid motion-reduce:animate-none duration-500">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <LuUsers className="text-primary size-4" />
          {t("title")}
        </CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <form className="flex flex-col gap-1.5" onSubmit={submitInvite} noValidate>
          <div className="flex gap-2.5">
            <Input
              type="email"
              placeholder={t("emailPlaceholder")}
              className="flex-1"
              {...register("email", {
                onChange: (event) => setEmailValue(event.target.value),
              })}
            />
            <Button type="submit" disabled={!isValid || isSubmitting}>
              <LuSend />
              {t("inviteButton")}
            </Button>
          </div>
          {showEmailError ? (
            <p className="text-destructive text-[12.5px]">{errors.email?.message}</p>
          ) : null}
        </form>

        {members.length === 0 ? (
          <p className="text-muted-foreground flex items-center gap-2 text-sm">
            <LuUsers className="size-4" />
            {t("empty")}
          </p>
        ) : (
          <div className="flex flex-col">
            {pageItems.map((member, index) => (
              <div
                key={member.id}
                style={{ animationDelay: `${index * 50}ms` }}
                className={cn(
                  "animate-in fade-in slide-in-from-bottom-1 fill-mode-backwards ease-fluid motion-reduce:animate-none hover:bg-accent/40 -mx-2 flex flex-wrap items-center justify-between gap-3 rounded-md px-2 py-3 transition-colors duration-300",
                  index !== pageItems.length - 1 && "border-border border-b",
                )}>
                <div className="flex min-w-0 items-center gap-2.5">
                  <Avatar className="size-8 shrink-0">
                    <AvatarFallback className="bg-accent text-accent-foreground text-xs font-medium">
                      {getInitials(member.name)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{member.name}</p>
                    <p className="text-muted-foreground truncate text-[13px]">{member.email}</p>
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
                          className="border-destructive text-destructive hover:bg-destructive/10">
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
            <Pagination
              page={page}
              totalPages={totalPages}
              onPrevious={goToPreviousPage}
              onNext={goToNextPage}
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
