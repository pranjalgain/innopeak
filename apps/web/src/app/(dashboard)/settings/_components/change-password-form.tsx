import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";

import { FIELD_ERROR_CLASS } from "@/app/(dashboard)/settings/_components/field-error";
import {
  type ChangePasswordFields,
  changePasswordSchema,
} from "@/app/(dashboard)/settings/_schemas/change-password.schema";
import { PasswordInput } from "@/components/common/password-input";
import {
  checkPasswordRequirements,
  passwordMeetsRequirements,
  PasswordRequirementsList,
} from "@/components/common/password-requirements-list";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

interface ChangePasswordFormProps {
  changePassword: (currentPassword: string, newPassword: string) => Promise<boolean>;
}

export function ChangePasswordForm({ changePassword }: ChangePasswordFormProps) {
  const t = useTranslations("settings.profile");
  const schema = useMemo(() => changePasswordSchema(t), [t]);
  // Collapsed by default — see `AddPasswordForm`'s own doc comment for the same pattern on the
  // SSO-only path. The fields are a sensitive, rarely-used action; showing three password inputs
  // on every visit to a page whose main purpose is just *viewing* your name/email/business is
  // noise (and a bigger target for shoulder-surfing) for the common case where nobody's changing
  // anything.
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
