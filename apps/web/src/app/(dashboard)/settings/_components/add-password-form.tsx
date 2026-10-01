import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";

import { FIELD_ERROR_CLASS } from "@/app/(dashboard)/settings/_components/field-error";
import {
  type SetPasswordFields,
  setPasswordSchema,
} from "@/app/(dashboard)/settings/_schemas/set-password.schema";
import { PasswordInput } from "@/components/common/password-input";
import {
  checkPasswordRequirements,
  passwordMeetsRequirements,
  PasswordRequirementsList,
} from "@/components/common/password-requirements-list";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

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
export function AddPasswordForm({ requestSetPasswordOtp, setPassword }: AddPasswordFormProps) {
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
