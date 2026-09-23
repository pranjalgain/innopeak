"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import type { Route } from "next";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useFormatter, useTranslations } from "next-intl";
import { type FormEvent, useCallback, useEffect, useMemo, useState } from "react";


import { useForm } from "react-hook-form";
import { LuMailPlus, LuSend, LuToggleLeft, LuUserRound } from "react-icons/lu";

import { platformAdminDisplayName } from "@/app/_libs/utils/admin-identity";
import { getInitials } from "@/app/_libs/utils/initials";
import {
  type InviteAdminFields,
  inviteAdminSchema,
} from "@/app/admin/settings/_schemas/invite-admin.schema";
import { AvatarUpload } from "@/components/common/avatar-upload";
import { ConfirmActionButton } from "@/components/common/confirm-action-dialog";
import { LoadErrorState } from "@/components/common/load-error-state";
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
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { usePlatformAdminInvites } from "@/hooks/admin/use-platform-admin-invites";
import { usePlatformAdminProfile } from "@/hooks/admin/use-platform-admin-profile";
import { useUpdatePlatformSettings } from "@/hooks/admin/use-update-platform-settings";
import { usePlatformSettings } from "@/hooks/common/use-platform-settings";
import type { PlatformAdminStatus, PlatformSettings } from "@/types/domain";

const DATE_FORMAT = { month: "short", day: "numeric", year: "numeric" } as const;

const STATUS_BADGE_CLASSNAME: Record<PlatformAdminStatus, string> = {
  active: "border-transparent bg-success-soft text-success",
  invited: "border-transparent bg-warning-soft text-warning",
  disabled: "border-transparent bg-muted text-muted-foreground",
};

function ProfileSection() {
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

function InviteSection() {
  const t = useTranslations("adminSettings.invite");
  const tStatus = useTranslations("adminSettings.invite.status");
  const format = useFormatter();
  const { invites, isLoading, isError, refetch, sendInvite, revokeInvite, setAdminStatus } =
    usePlatformAdminInvites();
  // The signed-in admin's own email, so the roster can hide the disable button on their own row —
  // the backend also refuses self-disable, this just avoids offering an action that always fails.
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
  // The schema has no separate "required" rule — an empty string simply fails `.email()` — so
  // blurring the field before typing anything (`mode: "onTouched"`) surfaced the same "not a valid
  // email" message a real typo would, nagging an admin who hadn't done anything yet. Mirrored into
  // local state via `register`'s onChange rather than read with `watch()`, which React Compiler
  // can't safely memoize — see `MembersSettingsSection`'s identical fix on the tenant side.
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
  // `invites` collapses a failed load to `[]` (see the hook), which otherwise renders identically
  // to a roster that is genuinely empty — an outage read as "no invites yet."
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
          {/* Visually hidden rather than absent: a placeholder is not an accessible name (it is
              dropped by some screen readers and disappears the moment anything is typed), and
              every other input on this screen has a real <Label>. `aria-describedby` wires the
              validation message below to the field so it is announced, not just drawn. */}
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
                    // status === "active", not the signed-in admin's own row, and not the seeded
                    // root admin. Requires `profile` to have actually loaded —
                    // `invite.email !== profile?.email` is `true` while `profile` is still
                    // `undefined` (loading, or its own fetch failed), which showed Disable on the
                    // signed-in admin's own row until their profile resolved — an action that
                    // always fails against the backend's own self-disable guard. `!invite.isRoot`
                    // is the same reasoning one row over: root has no inviter to re-enable it and
                    // no self-service signup to replace it, so the backend rejects disabling it
                    // outright — the control simply isn't offered here, rather than being offered
                    // and then failing.
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

interface PlatformToggleRowProps {
  label: string;
  helper: string;
  checked: boolean;
  disabled: boolean;
  onCheckedChange: (checked: boolean) => void;
  /** Manual stagger, since these four rows are individually written out below rather than
   *  mapped from an array — 60ms increments matches the delay step used everywhere else this
   *  page staggers a list. */
  delayMs: number;
}

function PlatformToggleRow({
  label,
  helper,
  checked,
  disabled,
  onCheckedChange,
  delayMs,
}: PlatformToggleRowProps) {
  return (
    <div
      style={{ animationDelay: `${delayMs}ms` }}
      className="border-border animate-in fade-in slide-in-from-bottom-1 fill-mode-backwards ease-fluid motion-reduce:animate-none flex items-center justify-between gap-4 border-b py-4 duration-300 last:border-b-0">
      <div>
        <p className="text-[13px] font-medium">{label}</p>
        <p className="text-muted-foreground mt-0.5 text-[13px]">{helper}</p>
      </div>
      <Switch checked={checked} disabled={disabled} onCheckedChange={onCheckedChange} />
    </div>
  );
}

function PlatformSection() {
  const t = useTranslations("adminSettings.platform");
  const { data: settings, isLoading, isError, refetch } = usePlatformSettings();
  const { update, isUpdating } = useUpdatePlatformSettings();

  if (isLoading) return <Skeleton className="h-72 w-full max-w-3xl rounded-xl" />;
  // See ProfileSection's twin comment — an infinite skeleton is not a loading state.
  if (isError || !settings) return <LoadErrorState onRetry={() => void refetch()} />;

  const toggle = (field: keyof PlatformSettings) => (checked: boolean) => {
    void update({ [field]: checked });
  };

  return (
    <Card className="animate-in fade-in slide-in-from-bottom-2 fill-mode-backwards ease-fluid motion-reduce:animate-none duration-500">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <LuToggleLeft className="text-primary size-4" />
          {t("title")}
        </CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col">
        <PlatformToggleRow
          label={t("sso.label")}
          helper={t("sso.helper")}
          checked={settings.ssoLoginEnabled}
          disabled={isUpdating}
          onCheckedChange={toggle("ssoLoginEnabled")}
          delayMs={0}
        />
        <PlatformToggleRow
          label={t("password.label")}
          helper={t("password.helper")}
          checked={settings.passwordLoginEnabled}
          disabled={isUpdating}
          onCheckedChange={toggle("passwordLoginEnabled")}
          delayMs={60}
        />
        <PlatformToggleRow
          label={t("social.label")}
          helper={t("social.helper")}
          checked={settings.socialLoginEnabled}
          disabled={isUpdating}
          onCheckedChange={toggle("socialLoginEnabled")}
          delayMs={120}
        />
        <PlatformToggleRow
          label={t("inviteMembers.label")}
          helper={t("inviteMembers.helper")}
          checked={settings.inviteMembersEnabled}
          disabled={isUpdating}
          onCheckedChange={toggle("inviteMembersEnabled")}
          delayMs={180}
        />
      </CardContent>
    </Card>
  );
}

/** Every tab this screen renders — all three are always available (unlike the tenant Settings
 * page, nothing here is conditionally hidden), so validating `?tab=` only ever needs to check
 * membership, never per-tab availability. */
const TABS = ["profile", "members", "platform"] as const;

export function AdminSettingsView() {
  const t = useTranslations("adminSettings");
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  /**
   * `Tabs` is **controlled from the URL**, and clicking a tab writes the URL back. The URL is the
   * single source of truth for which tab is showing; there is no second copy to fall out of step.
   *
   * Two earlier shapes both failed on the same journey — the account menu's "Profile" row, which
   * links to `${ROUTES.ADMIN_SETTINGS}?tab=profile`, clicked while already on this page:
   *
   *   - a hardcoded `defaultValue="profile"`: an already-mounted uncontrolled `Tabs` never
   *     re-reads `defaultValue`, so the URL changed and the view did not.
   *   - `key={initialTab}` to force a remount: `initialTab` resolves to `"profile"` both when
   *     `?tab=` is absent *and* when it is `?tab=profile`, so for this exact link the key never
   *     changed and no remount happened. It only ever worked on the tenant Settings page because
   *     that one defaults to `"general"`, making `?tab=profile` a genuinely different value.
   *
   * Writing the tab back on every click is what makes the link work at all: it guarantees the URL
   * reads `?tab=platform` while Platform is showing, so navigating to `?tab=profile` is a real
   * change rather than a no-op. `replace` rather than `push` keeps tab switching out of history,
   * so Back still leaves Settings instead of walking the tabs.
   */
  const requestedTab = searchParams.get("tab");
  const activeTab = useMemo(
    () => (TABS.includes(requestedTab as (typeof TABS)[number]) ? requestedTab! : "profile"),
    [requestedTab],
  );

  const handleTabChange = useCallback(
    (value: string) => {
      // `typedRoutes` cannot see that this interpolation only ever produces `/admin/settings?tab=`
      // plus one of the three literals in TABS. The cast is narrow on purpose: `pathname` is this
      // component's own route and `value` comes from `TabsTrigger`s built from TABS.
      router.replace(`${pathname}?tab=${value}` as Route, { scroll: false });
    },
    [router, pathname],
  );

  return (
    <div className="p-fluid-page flex flex-col gap-6">
      <Tabs value={activeTab} onValueChange={handleTabChange} className="max-w-3xl gap-5">
        <TabsList className="w-full justify-start overflow-x-auto scrollbar-hide px-1 sm:w-fit sm:max-w-full [&>[data-slot=tabs-trigger]]:flex-none">
          <TabsTrigger value="profile">{t("tabs.profile")}</TabsTrigger>
          <TabsTrigger value="members">{t("tabs.members")}</TabsTrigger>
          <TabsTrigger value="platform">{t("tabs.platform")}</TabsTrigger>
        </TabsList>

        <TabsContent value="profile">
          <ProfileSection />
        </TabsContent>

        <TabsContent value="members">
          <InviteSection />
        </TabsContent>

        <TabsContent value="platform">
          <PlatformSection />
        </TabsContent>
      </Tabs>
    </div>
  );
}
