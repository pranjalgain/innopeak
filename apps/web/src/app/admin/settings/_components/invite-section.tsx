import { zodResolver } from "@hookform/resolvers/zod";
import { useFormatter, useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { LuMailPlus, LuSend } from "react-icons/lu";

import { DATE_FORMAT } from "@/app/_libs/utils/date";
import {
  type InviteAdminFields,
  inviteAdminSchema,
} from "@/app/admin/settings/_schemas/invite-admin.schema";
import { ConfirmActionButton } from "@/components/common/confirm-action-dialog";
import { LoadErrorState } from "@/components/common/load-error-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { usePlatformAdminInvites } from "@/hooks/admin/use-platform-admin-invites";
import { usePlatformAdminProfile } from "@/hooks/admin/use-platform-admin-profile";
import type { PlatformAdminStatus } from "@/types/domain";

const STATUS_BADGE_CLASSNAME: Record<PlatformAdminStatus, string> = {
  active: "border-transparent bg-success-soft text-success",
  invited: "border-transparent bg-warning-soft text-warning",
  disabled: "border-transparent bg-muted text-muted-foreground",
};

export function InviteSection() {
  const t = useTranslations("adminSettings.invite");
  const tStatus = useTranslations("adminSettings.invite.status");
  const format = useFormatter();
  const { invites, isLoading, isError, refetch, sendInvite, revokeInvite, setAdminStatus } =
    usePlatformAdminInvites();
  // Hides Disable on the admin's own row; the backend also refuses self-disable.
  const { profile } = usePlatformAdminProfile();
  const schema = useMemo(() => inviteAdminSchema(t), [t]);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isValid, isSubmitting },
  } = useForm<InviteAdminFields>({
    resolver: zodResolver(schema),
    mode: "onTouched",
    defaultValues: { email: "" },
  });
  // No separate "required" rule: an empty string fails `.email()`, so blurring an untouched field would show "not a valid
  // email". Mirrored into local state rather than `watch()`, which React Compiler can't memoize safely.
  const [emailValue, setEmailValue] = useState("");
  const showEmailError = Boolean(errors.email) && emailValue.trim().length > 0;

  // Cleared only on success, so a rejected invite leaves the address in place to correct.
  const submitInvite = handleSubmit(async (values) => {
    const succeeded = await sendInvite(values.email);
    if (succeeded) {
      reset();
      setEmailValue("");
    }
  });

  if (isLoading) return <Skeleton className="h-56 w-full max-w-3xl rounded-xl" />;
  // `invites` collapses a failed load to `[]`, which would read as an empty roster during an outage.
  if (isError) return <LoadErrorState onRetry={refetch} />;

  return (
    <Card className="animate-in fade-in slide-in-from-bottom-2 fill-mode-backwards ease-fluid motion-reduce:animate-none duration-500">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <LuMailPlus className="text-primary size-4" />
          {t("title")}
        </CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <form className="flex flex-col gap-1.5" onSubmit={submitInvite} noValidate>
          {/* Visually hidden, not absent: a placeholder isn't an accessible name, and `aria-describedby` makes the validation message announced. */}
          <Label htmlFor="invite-email" className="sr-only">
            {t("emailPlaceholder")}
          </Label>
          <div className="flex gap-2.5">
            <Input
              id="invite-email"
              type="email"
              placeholder={t("emailPlaceholder")}
              className="flex-1"
              aria-invalid={showEmailError ? true : undefined}
              aria-describedby={showEmailError ? "invite-email-error" : undefined}
              {...register("email", {
                onChange: (event) => setEmailValue(event.target.value),
              })}
            />
            <Button type="submit" disabled={!isValid || isSubmitting}>
              <LuSend />
              {t("sendButton")}
            </Button>
          </div>
          {showEmailError ? (
            <p id="invite-email-error" role="alert" className="text-destructive text-[12.5px]">
              {errors.email?.message}
            </p>
          ) : null}
        </form>

        {invites.length === 0 ? (
          <p className="text-muted-foreground flex items-center gap-2 text-sm">
            <LuMailPlus className="size-4" />
            {t("empty")}
          </p>
        ) : (
          <div className="flex flex-col">
            {invites.map((invite, index) => (
              <div
                key={invite.id}
                style={{ animationDelay: `${index * 50}ms` }}
                className="border-border animate-in fade-in slide-in-from-bottom-1 fill-mode-backwards ease-fluid motion-reduce:animate-none hover:bg-accent/40 -mx-2 flex flex-wrap items-center justify-between gap-3 rounded-md border-b px-2 py-3 transition-colors duration-300 last:border-b-0">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{invite.email}</p>
                  <p className="text-muted-foreground text-[13px]">
                    {invite.status === "invited" && invite.expiresAt
                      ? t("expiresOn", {
                          date: format.dateTime(new Date(invite.expiresAt), DATE_FORMAT),
                        })
                      : t("invitedOn", {
                          date: format.dateTime(new Date(invite.invitedAt), DATE_FORMAT),
                        })}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className={STATUS_BADGE_CLASSNAME[invite.status]}>
                    {tStatus(invite.status)}
                  </Badge>
                  {invite.status === "invited" ? (
                    <ConfirmActionButton
                      trigger={
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="border-destructive text-destructive hover:bg-destructive/10">
                          {t("revoke")}
                        </Button>
                      }
                      title={t("confirmRevoke.title", { email: invite.email })}
                      description={t("confirmRevoke.description")}
                      confirmLabel={t("revoke")}
                      cancelLabel={t("cancel")}
                      destructive
                      onConfirm={() => void revokeInvite(invite.id)}
                    />
                  ) : invite.status === "disabled" ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => void setAdminStatus(invite.id, true)}>
                      {t("enable")}
                    </Button>
                  ) : profile && invite.email !== profile.email && !invite.isRoot ? (
                    // Not offered for a non-active invite, the admin's own row (`invite.email !== profile?.email` is true while `profile` is
                    // still undefined, so `profile` must have loaded), or the root admin, which the backend refuses to disable.
                    <ConfirmActionButton
                      trigger={
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="border-destructive text-destructive hover:bg-destructive/10">
                          {t("disable")}
                        </Button>
                      }
                      title={t("confirmDisable.title", { email: invite.email })}
                      description={t("confirmDisable.description")}
                      confirmLabel={t("disable")}
                      cancelLabel={t("cancel")}
                      destructive
                      onConfirm={() => void setAdminStatus(invite.id, false)}
                    />
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
