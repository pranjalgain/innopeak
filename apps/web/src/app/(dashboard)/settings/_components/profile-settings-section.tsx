"use client";


import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { LuUserRound } from "react-icons/lu";


import {
  type ChangePasswordFields,
  changePasswordSchema,
} from "@/app/(dashboard)/settings/_schemas/change-password.schema";
import {
  type SetPasswordFields,
  setPasswordSchema,
} from "@/app/(dashboard)/settings/_schemas/set-password.schema";
import { getInitials } from "@/app/_libs/utils/initials";
import { AvatarUpload } from "@/components/common/avatar-upload";
import { PasswordInput } from "@/components/common/password-input";
import {
  checkPasswordRequirements,
  passwordMeetsRequirements,
  PasswordRequirementsList,
} from "@/components/common/password-requirements-list";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useTenantOwnerProfile } from "@/hooks/settings/use-tenant-owner-profile";

const FIELD_ERROR_CLASS = "text-[12.5px] text-destructive";

/** Only reachable while the platform's passwordLoginEnabled setting is on — there's no password to manage otherwise. */
export function ProfileSettingsSection() {
  const t = useTranslations("settings.profile");
  const {
    profile,
    isLoading,
    updateAvatar,
    isUploadingAvatar,
    changePassword,
    requestSetPasswordOtp,
    setPassword,
  } = useTenantOwnerProfile();

  if (isLoading || !profile) return <Skeleton className="h-56 w-full max-w-3xl rounded-xl" />;

  return (
    <Card className="animate-in fade-in slide-in-from-bottom-2 fill-mode-backwards ease-fluid motion-reduce:animate-none duration-500">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <LuUserRound className="text-primary size-4" />
          {t("title")}
        </CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        <AvatarUpload
          avatarUrl={profile.avatarUrl}
          initials={getInitials(profile.name)}
          changeLabel={t("changePicture")}
          isUploading={isUploadingAvatar}
          onUpload={updateAvatar}
        />

        <div className="border-border flex flex-col gap-1.5 border-t pt-5">
          <Label>{t("nameLabel")}</Label>
          <p className="text-sm">{profile.name}</p>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label>{t("emailLabel")}</Label>
          <p className="text-sm">{profile.email}</p>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label>{t("businessNameLabel")}</Label>
          <p className="text-sm">{profile.businessName}</p>
        </div>

        {profile.hasPassword ? (
          <ChangePasswordForm changePassword={changePassword} />
        ) : (
          <AddPasswordForm requestSetPasswordOtp={requestSetPasswordOtp} setPassword={setPassword} />
        )}
      </CardContent>
    </Card>
  );
}

interface ChangePasswordFormProps {
  changePassword: (currentPassword: string, newPassword: string) => Promise<boolean>;
}

function ChangePasswordForm({ changePassword }: ChangePasswordFormProps) {
  const t = useTranslations("settings.profile");
  const schema = useMemo(() => changePasswordSchema(t), [t]);
  // Collapsed by default — see `AddPasswordForm` below for the same pattern on the SSO-only
  // path. The fields are a sensitive, rarely-used action; showing three password inputs on every
  // visit to a page whose main purpose is just *viewing* your name/email/business is noise (and
  // a bigger target for shoulder-surfing) for the common case where nobody's changing anything.
  const [expanded, setExpanded] = useState(false);

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
  const [newPasswordValue, setNewPasswordValue] = useState("");
  const requirements = checkPasswordRequirements(newPasswordValue);
  // Hidden again once every rule passes — a column of green ticks is noise, not information.
  const showRequirements =
    Boolean(touchedFields.newPassword) &&
    newPasswordValue.length > 0 &&
    !passwordMeetsRequirements(requirements);

  const collapse = () => {
    reset();
    setNewPasswordValue("");
    setExpanded(false);
  };

  // `reset()` only on success, so a rejected current password doesn't wipe what the owner typed.
  const submitPassword = handleSubmit(async (values) => {
    const succeeded = await changePassword(values.currentPassword, values.newPassword);
    if (succeeded) collapse();
  });

  if (!expanded) {
    return (
      <div className="border-border flex flex-col gap-2.5 border-t pt-5">
        <div>
          <p className="text-sm font-medium">{t("changePasswordTitle")}</p>
          <p className="text-muted-foreground mt-0.5 text-[13px]">
            {t("changePasswordDescription")}
          </p>
        </div>
        <div>
          <Button type="button" variant="outline" onClick={() => setExpanded(true)}>
            {t("changePassword")}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <form
      className="border-border animate-in fade-in slide-in-from-bottom-1 ease-fluid motion-reduce:animate-none flex max-w-sm flex-col gap-4 border-t pt-5 duration-300"
      onSubmit={submitPassword}
      noValidate>
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
            onChange: (event) => setNewPasswordValue(event.target.value),
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

      <div className="flex gap-2.5">
        <Button type="button" variant="ghost" onClick={collapse} disabled={isSubmitting}>
          {t("cancel")}
        </Button>
        <Button type="submit" variant="outline" disabled={!isValid || isSubmitting}>
          {t("updatePassword")}
        </Button>
      </div>
    </form>
  );
}

interface AddPasswordFormProps {
  requestSetPasswordOtp: () => Promise<boolean>;
  setPassword: (newPassword: string, otp: string) => Promise<boolean>;
}

const OTP_RESEND_COOLDOWN_SECONDS = 60;

/**
 * Shown instead of `ChangePasswordForm` for a Google/SSO-only account — there is no current
 * password to prove, so the fields (and the collapsed prompt in front of them) are deliberately
 * different rather than a `ChangePasswordForm` with one field hidden. A step-up OTP (mailed by
 * `requestSetPasswordOtp`) stands in for that missing current-password proof: without it, an
 * access token alone would be enough to grant this account a permanent credential — see
 * `AuthService.setPassword`'s doc comment on the backend.
 */
function AddPasswordForm({ requestSetPasswordOtp, setPassword }: AddPasswordFormProps) {
  const t = useTranslations("settings.profile");
  const schema = useMemo(() => setPasswordSchema(t), [t]);
  const [expanded, setExpanded] = useState(false);
  const [isSendingOtp, setIsSendingOtp] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isValid, isSubmitting, touchedFields },
  } = useForm<SetPasswordFields>({
    resolver: zodResolver(schema),
    mode: "onTouched",
    defaultValues: { otp: "", newPassword: "", confirmPassword: "" },
  });

  const [newPasswordValue, setNewPasswordValue] = useState("");
  const requirements = checkPasswordRequirements(newPasswordValue);
  const showRequirements =
    Boolean(touchedFields.newPassword) &&
    newPasswordValue.length > 0 &&
    !passwordMeetsRequirements(requirements);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setInterval(() => setCooldown((prev) => Math.max(prev - 1, 0)), 1000);
    return () => clearInterval(timer);
  }, [cooldown]);

  const collapse = () => {
    reset();
    setNewPasswordValue("");
    setExpanded(false);
    setCooldown(0);
  };

  const sendOtp = async () => {
    setIsSendingOtp(true);
    try {
      const sent = await requestSetPasswordOtp();
      if (sent) {
        setExpanded(true);
        setCooldown(OTP_RESEND_COOLDOWN_SECONDS);
      }
    } finally {
      setIsSendingOtp(false);
    }
  };

  // On success `profile.hasPassword` flips to true and this component unmounts (replaced by
  // `ChangePasswordForm`), so there's no local state left to clear.
  const submitPassword = handleSubmit(async (values) => {
    await setPassword(values.newPassword, values.otp);
  });

  if (!expanded) {
    return (
      <div className="border-border flex flex-col gap-2.5 border-t pt-5">
        <div>
          <p className="text-sm font-medium">{t("addPasswordTitle")}</p>
          <p className="text-muted-foreground mt-0.5 text-[13px]">{t("addPasswordDescription")}</p>
        </div>
        <div>
          <Button type="button" variant="outline" onClick={() => void sendOtp()} disabled={isSendingOtp}>
            {isSendingOtp ? t("sendingCode") : t("addPassword")}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <form
      className="border-border animate-in fade-in slide-in-from-bottom-1 ease-fluid motion-reduce:animate-none flex max-w-sm flex-col gap-4 border-t pt-5 duration-300"
      onSubmit={submitPassword}
      noValidate>
      <div>
        <p className="text-sm font-medium">{t("addPasswordTitle")}</p>
        <p className="text-muted-foreground mt-0.5 text-[13px]">{t("otpSentDescription")}</p>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="owner-add-otp">{t("otpLabel")}</Label>
        <Input
          id="owner-add-otp"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          {...register("otp")}
        />
        {errors.otp ? <p className={FIELD_ERROR_CLASS}>{errors.otp.message}</p> : null}
        <Button
          type="button"
          variant="link"
          size="sm"
          className="h-auto w-fit p-0"
          disabled={cooldown > 0 || isSendingOtp}
          onClick={() => void sendOtp()}>
          {cooldown > 0 ? t("resendCodeIn", { seconds: cooldown }) : t("resendCode")}
        </Button>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="owner-add-password">{t("newPasswordLabel")}</Label>
        <PasswordInput
          id="owner-add-password"
          autoComplete="new-password"
          {...register("newPassword", {
            onChange: (event) => setNewPasswordValue(event.target.value),
          })}
        />
        {showRequirements ? <PasswordRequirementsList requirements={requirements} /> : null}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="owner-add-confirm-password">{t("confirmPasswordLabel")}</Label>
        <PasswordInput
          id="owner-add-confirm-password"
          autoComplete="new-password"
          {...register("confirmPassword")}
        />
        {errors.confirmPassword ? (
          <p className={FIELD_ERROR_CLASS}>{errors.confirmPassword.message}</p>
        ) : null}
      </div>

      <div className="flex gap-2.5">
        <Button type="button" variant="ghost" onClick={collapse} disabled={isSubmitting}>
          {t("cancel")}
        </Button>
        <Button type="submit" variant="outline" disabled={!isValid || isSubmitting}>
          {isSubmitting ? t("settingPassword") : t("setPassword")}
        </Button>
      </div>
    </form>
  );
}
