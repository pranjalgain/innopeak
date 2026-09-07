"use client";

import { useTranslations } from "next-intl";
import * as React from "react";
import { LuMailPlus, LuSend } from "react-icons/lu";

import { CURRENT_SUPER_ADMIN } from "@/app/_libs/constants/current-owner";
import { AvatarUpload } from "@/components/common/avatar-upload";
import { ConfirmActionDialog } from "@/components/common/confirm-action-dialog";
import { PasswordInput } from "@/components/common/password-input";
import {
  checkPasswordRequirements,
  passwordMeetsRequirements,
  PasswordRequirementsList,
} from "@/components/common/password-requirements-list";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { usePlatformAdminInvites } from "@/hooks/admin/use-platform-admin-invites";
import { usePlatformAdminProfile } from "@/hooks/admin/use-platform-admin-profile";
import type { PlatformAdminStatus } from "@/types/domain";

const DATE_FORMATTER = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" });

const STATUS_BADGE_CLASSNAME: Record<PlatformAdminStatus, string> = {
  active: "border-transparent bg-success-soft text-success",
  invited: "border-transparent bg-warning-soft text-warning",
  disabled: "border-transparent bg-muted text-muted-foreground",
};

function ProfileSection() {
  const t = useTranslations("adminSettings.profile");
  const { profile, isLoading, updateAvatar, changePassword } = usePlatformAdminProfile();
  const [currentPassword, setCurrentPassword] = React.useState("");
  const [newPassword, setNewPassword] = React.useState("");
  const [confirmPassword, setConfirmPassword] = React.useState("");
  const [newPasswordBlurred, setNewPasswordBlurred] = React.useState(false);
  const [confirmBlurred, setConfirmBlurred] = React.useState(false);

  if (isLoading || !profile) return <Skeleton className="h-56 w-full max-w-3xl rounded-xl" />;

  const requirements = checkPasswordRequirements(newPassword);
  const newPasswordValid = passwordMeetsRequirements(requirements);
  const hasConfirmValue = confirmPassword.length > 0;
  const passwordsMatch = newPassword === confirmPassword;

  const showRequirements = newPasswordBlurred && newPassword.length > 0 && !newPasswordValid;
  const showMismatch = confirmBlurred && hasConfirmValue && !passwordsMatch;

  const canSubmitPassword = currentPassword.trim() !== "" && newPasswordValid && passwordsMatch && hasConfirmValue;

  const handlePasswordSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!canSubmitPassword) return;
    const succeeded = await changePassword(currentPassword, newPassword);
    if (succeeded) {
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setNewPasswordBlurred(false);
      setConfirmBlurred(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        <AvatarUpload
          avatarUrl={profile.avatarUrl}
          initials={CURRENT_SUPER_ADMIN.initials}
          changeLabel={t("changePicture")}
          onUpload={(avatarUrl) => void updateAvatar(avatarUrl)}
        />

        <div className="flex flex-col gap-1.5 border-t border-border pt-5">
          <Label>{t("emailLabel")}</Label>
          <p className="text-sm">{profile.email}</p>
        </div>

        <form
          className="flex max-w-sm flex-col gap-4 border-t border-border pt-5"
          onSubmit={(e) => void handlePasswordSubmit(e)}
        >
          <p className="text-sm font-medium">{t("changePasswordTitle")}</p>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="current-password">{t("currentPasswordLabel")}</Label>
            <PasswordInput
              id="current-password"
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
              autoComplete="current-password"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="new-password">{t("newPasswordLabel")}</Label>
            <PasswordInput
              id="new-password"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              onBlur={() => setNewPasswordBlurred(true)}
              autoComplete="new-password"
            />
            {showRequirements ? <PasswordRequirementsList requirements={requirements} /> : null}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="confirm-password">{t("confirmPasswordLabel")}</Label>
            <PasswordInput
              id="confirm-password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              onBlur={() => setConfirmBlurred(true)}
              autoComplete="new-password"
            />
            {showMismatch ? <p className="text-[12.5px] text-destructive">{t("passwordMismatch")}</p> : null}
          </div>

          <div>
            <Button type="submit" variant="outline" disabled={!canSubmitPassword}>
              {t("updatePassword")}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function InviteSection() {
  const t = useTranslations("adminSettings.invite");
  const tStatus = useTranslations("adminSettings.invite.status");
  const { invites, isLoading, sendInvite, revokeInvite } = usePlatformAdminInvites();
  const [email, setEmail] = React.useState("");

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!email.trim()) return;
    const succeeded = await sendInvite(email.trim());
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
            {t("sendButton")}
          </Button>
        </form>

        {invites.length === 0 ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <LuMailPlus className="size-4" />
            {t("empty")}
          </p>
        ) : (
          <div className="flex flex-col">
            {invites.map((invite) => (
              <div
                key={invite.id}
                className="flex flex-wrap items-center justify-between gap-3 border-b border-border py-3 last:border-b-0"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{invite.email}</p>
                  <p className="text-[13px] text-muted-foreground">
                    {invite.status === "invited"
                      ? t("expiresOn", { date: DATE_FORMATTER.format(new Date(invite.expiresAt)) })
                      : t("invitedOn", { date: DATE_FORMATTER.format(new Date(invite.invitedAt)) })}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className={STATUS_BADGE_CLASSNAME[invite.status]}>
                    {tStatus(invite.status)}
                  </Badge>
                  {invite.status === "invited" ? (
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
                      title={t("confirmRevoke.title", { email: invite.email })}
                      description={t("confirmRevoke.description")}
                      confirmLabel={t("revoke")}
                      cancelLabel={t("cancel")}
                      destructive
                      onConfirm={() => void revokeInvite(invite.id)}
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

export function AdminSettingsView() {
  const t = useTranslations("adminSettings");

  return (
    <div className="flex flex-col gap-6 p-fluid-page">
      <Tabs defaultValue="profile" className="max-w-3xl gap-5">
        <TabsList className="w-full justify-start overflow-x-auto px-1 sm:w-fit [&>[data-slot=tabs-trigger]]:flex-none">
          <TabsTrigger value="profile">{t("tabs.profile")}</TabsTrigger>
          <TabsTrigger value="members">{t("tabs.members")}</TabsTrigger>
        </TabsList>

        <TabsContent value="profile">
          <ProfileSection />
        </TabsContent>

        <TabsContent value="members">
          <InviteSection />
        </TabsContent>
      </Tabs>
    </div>
  );
}
