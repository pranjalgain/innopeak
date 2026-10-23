import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";

import {
  type SetPasswordFields,
  setPasswordSchema,
} from "@/app/(dashboard)/settings/_schemas/set-password.schema";
import { FieldError } from "@/components/common/field-error";
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

/** For Google/SSO-only accounts with no current password to prove; a mailed step-up OTP stands in so an access token alone can't grant a permanent credential. */
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

  // Keyed on whether a countdown is running, not on `cooldown`: re-keying every tick rebuilt the interval and made the wait run long.
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

  // `profile.hasPassword` flips on success and this unmounts, so no local state needs clearing.
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
          aria-invalid={errors.otp ? true : undefined}
          aria-describedby={errors.otp ? "owner-add-otp-error" : undefined}
          {...register("otp")}
        />
        {errors.otp ? <FieldError id="owner-add-otp-error">{errors.otp.message}</FieldError> : null}
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
          aria-invalid={errors.newPassword ? true : undefined}
          aria-describedby={errors.newPassword ? "owner-add-password-error" : undefined}
          {...register("newPassword", {
            onChange: (event) => setNewPasswordValue(event.target.value),
          })}
        />
        {showRequirements ? (
          <PasswordRequirementsList requirements={requirements} />
        ) : errors.newPassword ? (
          <FieldError id="owner-add-password-error">{errors.newPassword.message}</FieldError>
        ) : null}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="owner-add-confirm-password">{t("confirmPasswordLabel")}</Label>
        <PasswordInput
          id="owner-add-confirm-password"
          autoComplete="new-password"
          aria-invalid={errors.confirmPassword ? true : undefined}
          aria-describedby={errors.confirmPassword ? "owner-add-confirm-password-error" : undefined}
          {...register("confirmPassword")}
        />
        {errors.confirmPassword ? (
          <FieldError id="owner-add-confirm-password-error">{errors.confirmPassword.message}</FieldError>
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
