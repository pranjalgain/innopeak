import { useTranslations } from "next-intl";
import { type FormEvent, useEffect, useState } from "react";
import { LuUserRound } from "react-icons/lu";

import { platformAdminDisplayName } from "@/app/_libs/utils/admin-identity";
import { getInitials } from "@/app/_libs/utils/initials";
import { AvatarUpload } from "@/components/common/avatar-upload";
import { LoadErrorState } from "@/components/common/load-error-state";
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
import { usePlatformAdminProfile } from "@/hooks/admin/use-platform-admin-profile";

export function ProfileSection() {
  const t = useTranslations("adminSettings.profile");
  const {
    profile,
    isLoading,
    isError,
    refetch,
    updateAvatar,
    isUploadingAvatar,
    changePassword,
    isChangingPassword,
    requestSetPasswordOtp,
    isSendingSetPasswordOtp,
    setPassword,
    isSettingPassword,
  } = usePlatformAdminProfile();

  if (isLoading) return <Skeleton className="h-56 w-full max-w-3xl rounded-xl" />;
  // `!profile` was folded into the loading branch, so a failed request left a grey rectangle on
  // screen forever: `retry: false` means `isLoading` goes false with no data and nothing ever
  // retries, and the one error toast had already faded.
  if (isError || !profile) return <LoadErrorState onRetry={refetch} />;

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
          initials={getInitials(platformAdminDisplayName(profile.email))}
          changeLabel={t("changePicture")}
          isUploading={isUploadingAvatar}
          onUpload={updateAvatar}
        />

        <div className="border-border flex flex-col gap-1.5 border-t pt-5">
          <Label>{t("emailLabel")}</Label>
          <p className="text-sm">{profile.email}</p>
        </div>

        {profile.hasPassword ? (
          <ChangePasswordForm changePassword={changePassword} isChangingPassword={isChangingPassword} />
        ) : (
          <AddPasswordForm
            requestSetPasswordOtp={requestSetPasswordOtp}
            isSendingOtp={isSendingSetPasswordOtp}
            setPassword={setPassword}
            isSettingPassword={isSettingPassword}
          />
        )}
      </CardContent>
    </Card>
  );
}

interface ChangePasswordFormProps {
  changePassword: (currentPassword: string, newPassword: string) => Promise<boolean>;
  /** Disables submit while the request is in flight — see the button's own comment. */
  isChangingPassword: boolean;
}

function ChangePasswordForm({ changePassword, isChangingPassword }: ChangePasswordFormProps) {
  const t = useTranslations("adminSettings.profile");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [newPasswordBlurred, setNewPasswordBlurred] = useState(false);
  const [confirmBlurred, setConfirmBlurred] = useState(false);
  // Collapsed by default — a sensitive, rarely-used action; showing three password inputs on
  // every visit to a page whose main purpose is just viewing your email is noise (and a bigger
  // target for shoulder-surfing) for the common case where nobody's changing anything. Mirrors
  // the tenant-owner profile section's own `ChangePasswordForm`.
  const [expanded, setExpanded] = useState(false);

  const requirements = checkPasswordRequirements(newPassword);
  const newPasswordValid = passwordMeetsRequirements(requirements);
  const hasConfirmValue = confirmPassword.length > 0;
  const passwordsMatch = newPassword === confirmPassword;

  // Hidden again once every rule passes — a column of green ticks is noise, not information.
  const showRequirements = newPasswordBlurred && newPassword.length > 0 && !newPasswordValid;
  const showMismatch = confirmBlurred && hasConfirmValue && !passwordsMatch;

  const canSubmitPassword =
    currentPassword.trim() !== "" && newPasswordValid && passwordsMatch && hasConfirmValue;

  const collapse = () => {
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setNewPasswordBlurred(false);
    setConfirmBlurred(false);
    setExpanded(false);
  };

  const handlePasswordSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!canSubmitPassword) return;
    if (isChangingPassword) return;
    const succeeded = await changePassword(currentPassword, newPassword);
    if (succeeded) collapse();
  };

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
      onSubmit={(e) => void handlePasswordSubmit(e)}>
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
        {showMismatch ? (
          <p className="text-destructive text-[12.5px]">{t("passwordMismatch")}</p>
        ) : null}
      </div>

      <div className="flex gap-2.5">
        <Button type="button" variant="ghost" onClick={collapse}>
          {t("cancel")}
        </Button>
        {/* Also disabled while in flight. Without it a double-click fired two requests: the first
            rotated the hash, so the second's `currentPassword` no longer matched and answered 401
            — the admin saw "Password changed." immediately followed by an error, with no way to
            tell which one had taken effect. The invite form above already guards this way. */}
        <Button type="submit" variant="outline" disabled={!canSubmitPassword || isChangingPassword}>
          {t("updatePassword")}
        </Button>
      </div>
    </form>
  );
}

interface AddPasswordFormProps {
  requestSetPasswordOtp: () => Promise<boolean>;
  isSendingOtp: boolean;
  setPassword: (newPassword: string, otp: string) => Promise<boolean>;
  isSettingPassword: boolean;
}

const OTP_RESEND_COOLDOWN_SECONDS = 60;

/**
 * Shown instead of `ChangePasswordForm` for a Google-only admin (accepted their invite via SSO) —
 * there is no current password to prove, so the fields (and the collapsed prompt in front of
 * them) are deliberately different rather than a `ChangePasswordForm` with one field hidden. A
 * step-up OTP (mailed by `requestSetPasswordOtp`) stands in for that missing current-password
 * proof — see `AdminSettingsService.setPassword`'s doc comment on the backend. Mirrors the
 * tenant-owner profile section's own `AddPasswordForm`, adapted to this file's plain-`useState`
 * style rather than react-hook-form/zod.
 */
function AddPasswordForm({
  requestSetPasswordOtp,
  isSendingOtp,
  setPassword,
  isSettingPassword,
}: AddPasswordFormProps) {
  const t = useTranslations("adminSettings.profile");
  const [otp, setOtp] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [newPasswordBlurred, setNewPasswordBlurred] = useState(false);
  const [confirmBlurred, setConfirmBlurred] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  const requirements = checkPasswordRequirements(newPassword);
  const newPasswordValid = passwordMeetsRequirements(requirements);
  const hasConfirmValue = confirmPassword.length > 0;
  const passwordsMatch = newPassword === confirmPassword;

  const showRequirements = newPasswordBlurred && newPassword.length > 0 && !newPasswordValid;
  const showMismatch = confirmBlurred && hasConfirmValue && !passwordsMatch;

  const canSubmitPassword =
    otp.trim().length === 6 && newPasswordValid && passwordsMatch && hasConfirmValue;

  // Depends on whether a countdown is running, not on its current value: keying this to
  // `cooldown` itself tore the interval down and rebuilt it on every tick, throwing away whatever
  // part of that second had already elapsed and making the "60s" wait run visibly long. The
  // functional update is what lets this read the latest value without depending on it.
  const cooldownActive = cooldown > 0;
  useEffect(() => {
    if (!cooldownActive) return;
    const timer = setInterval(() => setCooldown((prev) => Math.max(prev - 1, 0)), 1000);
    return () => clearInterval(timer);
  }, [cooldownActive]);

  const collapse = () => {
    setOtp("");
    setNewPassword("");
    setConfirmPassword("");
    setNewPasswordBlurred(false);
    setConfirmBlurred(false);
    setExpanded(false);
    setCooldown(0);
  };

  const sendOtp = async () => {
    const sent = await requestSetPasswordOtp();
    if (sent) {
      setExpanded(true);
      setCooldown(OTP_RESEND_COOLDOWN_SECONDS);
    }
  };

  // On success `profile.hasPassword` flips to true and this component unmounts (replaced by
  // `ChangePasswordForm`), so there's no local state left to clear.
  const handlePasswordSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!canSubmitPassword || isSettingPassword) return;
    await setPassword(newPassword, otp);
  };

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
      onSubmit={(e) => void handlePasswordSubmit(e)}>
      <div>
        <p className="text-sm font-medium">{t("addPasswordTitle")}</p>
        <p className="text-muted-foreground mt-0.5 text-[13px]">{t("otpSentDescription")}</p>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="admin-add-otp">{t("otpLabel")}</Label>
        <Input
          id="admin-add-otp"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          value={otp}
          onChange={(event) => setOtp(event.target.value)}
        />
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
        <Label htmlFor="admin-add-password">{t("newPasswordLabel")}</Label>
        <PasswordInput
          id="admin-add-password"
          value={newPassword}
          onChange={(event) => setNewPassword(event.target.value)}
          onBlur={() => setNewPasswordBlurred(true)}
          autoComplete="new-password"
        />
        {showRequirements ? <PasswordRequirementsList requirements={requirements} /> : null}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="admin-add-confirm-password">{t("confirmPasswordLabel")}</Label>
        <PasswordInput
          id="admin-add-confirm-password"
          value={confirmPassword}
          onChange={(event) => setConfirmPassword(event.target.value)}
          onBlur={() => setConfirmBlurred(true)}
          autoComplete="new-password"
        />
        {showMismatch ? (
          <p className="text-destructive text-[12.5px]">{t("passwordMismatch")}</p>
        ) : null}
      </div>

      <div className="flex gap-2.5">
        <Button type="button" variant="ghost" onClick={collapse} disabled={isSettingPassword}>
          {t("cancel")}
        </Button>
        <Button type="submit" variant="outline" disabled={!canSubmitPassword || isSettingPassword}>
          {isSettingPassword ? t("settingPassword") : t("setPassword")}
        </Button>
      </div>
    </form>
  );
}
