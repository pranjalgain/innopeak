"use client";

import { useTranslations } from "next-intl";
import * as React from "react";

import { CURRENT_OWNER } from "@/app/_libs/constants/current-owner";
import { AvatarUpload } from "@/components/common/avatar-upload";
import { PasswordInput } from "@/components/common/password-input";
import {
  checkPasswordRequirements,
  passwordMeetsRequirements,
  PasswordRequirementsList,
} from "@/components/common/password-requirements-list";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useTenantOwnerProfile } from "@/hooks/settings/use-tenant-owner-profile";

/** Only reachable while `AUTH_METHODS.password` is enabled — there's no password to manage otherwise. */
export function ProfileSettingsSection() {
  const t = useTranslations("settings.profile");
  const { profile, isLoading, updateAvatar, changePassword } = useTenantOwnerProfile();
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
          initials={CURRENT_OWNER.initials}
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
            <Label htmlFor="owner-current-password">{t("currentPasswordLabel")}</Label>
            <PasswordInput
              id="owner-current-password"
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
              autoComplete="current-password"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="owner-new-password">{t("newPasswordLabel")}</Label>
            <PasswordInput
              id="owner-new-password"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              onBlur={() => setNewPasswordBlurred(true)}
              autoComplete="new-password"
            />
            {showRequirements ? <PasswordRequirementsList requirements={requirements} /> : null}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="owner-confirm-password">{t("confirmPasswordLabel")}</Label>
            <PasswordInput
              id="owner-confirm-password"
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
