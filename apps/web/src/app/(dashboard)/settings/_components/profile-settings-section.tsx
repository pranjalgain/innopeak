"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import * as React from "react";
import { useForm } from "react-hook-form";

import {
  type ChangePasswordFields,
  changePasswordSchema,
} from "@/app/(dashboard)/settings/_schemas/change-password.schema";
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

const FIELD_ERROR_CLASS = "text-[12.5px] text-destructive";

/** Only reachable while `AUTH_METHODS.password` is enabled — there's no password to manage otherwise. */
export function ProfileSettingsSection() {
  const t = useTranslations("settings.profile");
  const { profile, isLoading, updateAvatar, changePassword } = useTenantOwnerProfile();
  const schema = React.useMemo(() => changePasswordSchema(t), [t]);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isValid, isSubmitting, touchedFields },
  } = useForm<ChangePasswordFields>({
    resolver: zodResolver(schema),
    mode: "onTouched",
    defaultValues: { currentPassword: "", newPassword: "", confirmPassword: "" },
  });

  // Mirrored into local state via `register`'s onChange rather than read with `watch()`: the
  // checklist needs the value on every keystroke, and `watch` cannot be memoized safely.
  const [newPasswordValue, setNewPasswordValue] = React.useState("");
  const requirements = checkPasswordRequirements(newPasswordValue);
  // Hidden again once every rule passes — a column of green ticks is noise, not information.
  const showRequirements =
    Boolean(touchedFields.newPassword) &&
    newPasswordValue.length > 0 &&
    !passwordMeetsRequirements(requirements);

  // `reset()` only on success, so a rejected current password doesn't wipe what the owner typed.
  const submitPassword = handleSubmit(async values => {
    const succeeded = await changePassword(values.currentPassword, values.newPassword);
    if (succeeded) {
      reset();
      setNewPasswordValue("");
    }
  });

  if (isLoading || !profile) return <Skeleton className="h-56 w-full max-w-3xl rounded-xl" />;

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
          onSubmit={submitPassword}
          noValidate
        >
          <p className="text-sm font-medium">{t("changePasswordTitle")}</p>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="owner-current-password">{t("currentPasswordLabel")}</Label>
            <PasswordInput
              id="owner-current-password"
              autoComplete="current-password"
              {...register("currentPassword")}
            />
            {errors.currentPassword ? (
              <p className={FIELD_ERROR_CLASS}>{errors.currentPassword.message}</p>
            ) : null}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="owner-new-password">{t("newPasswordLabel")}</Label>
            <PasswordInput
              id="owner-new-password"
              autoComplete="new-password"
              {...register("newPassword", {
                onChange: event => setNewPasswordValue(event.target.value),
              })}
            />
            {showRequirements ? <PasswordRequirementsList requirements={requirements} /> : null}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="owner-confirm-password">{t("confirmPasswordLabel")}</Label>
            <PasswordInput
              id="owner-confirm-password"
              autoComplete="new-password"
              {...register("confirmPassword")}
            />
            {errors.confirmPassword ? (
              <p className={FIELD_ERROR_CLASS}>{errors.confirmPassword.message}</p>
            ) : null}
          </div>

          <div>
            <Button type="submit" variant="outline" disabled={!isValid || isSubmitting}>
              {t("updatePassword")}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
