"use client";


import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";


import {
  type CreateAccountFields,
  createAccountSchema,
} from "@/app/(auth)/_schemas/create-account.schema";
import { PasswordInput } from "@/components/common/password-input";
import {
  checkPasswordRequirements,
  passwordMeetsRequirements,
  PasswordRequirementsList,
} from "@/components/common/password-requirements-list";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/** The signup payload. Deliberately narrower than the form's fields — `confirmPassword` is UI-only. */
export interface CreateAccountFormValues {
  name: string;
  businessName: string;
  email: string;
  password: string;
}

interface CreateAccountFormProps {
  isLoading: boolean;
  onSubmit: (values: CreateAccountFormValues) => void;
}

const FIELD_ERROR_CLASS = "text-[12.5px] text-destructive";

/**
 * Signup's own account-creation form — deliberately not shared with login's `PasswordAuthForm`:
 * login never needs a name field or this much validation for an account that already exists.
 *
 * Validation is react-hook-form + a zod resolver (`_schemas/create-account.schema.ts`), with
 * `mode: 'onTouched'` so a message only appears once its field has been blurred at least once,
 * then updates live as the user keeps editing.
 *
 * The password field shows the live checklist instead of its resolver error: the checklist names
 * every unmet rule at once, where the error message can only name the first one zod hit.
 */
export function CreateAccountForm({ isLoading, onSubmit }: CreateAccountFormProps) {
  const t = useTranslations("onboardingSignup.createAccount");
  const schema = useMemo(() => createAccountSchema(t), [t]);

  const {
    register,
    handleSubmit,
    formState: { errors, isValid, touchedFields },
  } = useForm<CreateAccountFields>({
    resolver: zodResolver(schema),
    mode: "onTouched",
    defaultValues: { name: "", businessName: "", email: "", password: "", confirmPassword: "" },
  });

  // Mirrored into local state via `register`'s onChange rather than read with `watch()`: the
  // checklist needs the value on every keystroke, and `watch` cannot be memoized safely.
  const [passwordValue, setPasswordValue] = useState("");
  const requirements = checkPasswordRequirements(passwordValue);
  // Hidden again once every rule passes — a column of green ticks is noise, not information.
  const showRequirements =
    Boolean(touchedFields.password) &&
    passwordValue.length > 0 &&
    !passwordMeetsRequirements(requirements);

  const submit = handleSubmit((values) => {
    onSubmit({
      name: values.name,
      businessName: values.businessName,
      email: values.email,
      password: values.password,
    });
  });

  return (
    <form className="flex flex-col gap-4" onSubmit={submit} noValidate>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="signup-name">{t("nameLabel")}</Label>
        <Input
          id="signup-name"
          type="text"
          placeholder={t("namePlaceholder")}
          autoComplete="name"
          {...register("name")}
        />
        {errors.name ? <p className={FIELD_ERROR_CLASS}>{errors.name.message}</p> : null}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="signup-business-name">{t("businessNameLabel")}</Label>
        <Input
          id="signup-business-name"
          type="text"
          placeholder={t("businessNamePlaceholder")}
          autoComplete="organization"
          {...register("businessName")}
        />
        {errors.businessName ? (
          <p className={FIELD_ERROR_CLASS}>{errors.businessName.message}</p>
        ) : null}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="signup-email">{t("emailLabel")}</Label>
        <Input
          id="signup-email"
          type="email"
          placeholder={t("emailPlaceholder")}
          autoComplete="username"
          {...register("email")}
        />
        {errors.email ? <p className={FIELD_ERROR_CLASS}>{errors.email.message}</p> : null}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="signup-password">{t("passwordLabel")}</Label>
        <PasswordInput
          id="signup-password"
          placeholder={t("passwordLabel")}
          autoComplete="new-password"
          {...register("password", {
            onChange: (event) => setPasswordValue(event.target.value),
          })}
        />
        {showRequirements ? <PasswordRequirementsList requirements={requirements} /> : null}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="signup-confirm-password">{t("confirmPasswordLabel")}</Label>
        <PasswordInput
          id="signup-confirm-password"
          placeholder={t("confirmPasswordLabel")}
          autoComplete="new-password"
          {...register("confirmPassword")}
        />
        {errors.confirmPassword ? (
          <p className={FIELD_ERROR_CLASS}>{errors.confirmPassword.message}</p>
        ) : null}
      </div>

      <Button type="submit" size="block" disabled={!isValid || isLoading}>
        {isLoading ? t("submitting") : t("submit")}
      </Button>
    </form>
  );
}
