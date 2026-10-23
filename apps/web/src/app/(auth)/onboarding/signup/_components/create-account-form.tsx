"use client";


import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";


import {
  type CreateAccountFields,
  createAccountSchema,
} from "@/app/(auth)/_schemas/create-account.schema";
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

/** Not shared with login's `PasswordAuthForm`. The password field shows the live checklist instead of its resolver error, since the checklist names every unmet rule at once. */
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
  // Hidden once every rule passes: a column of green ticks is noise.
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
          aria-invalid={errors.name ? true : undefined}
          aria-describedby={errors.name ? "signup-name-error" : undefined}
          {...register("name")}
        />
        {errors.name ? <FieldError id="signup-name-error">{errors.name.message}</FieldError> : null}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="signup-business-name">{t("businessNameLabel")}</Label>
        <Input
          id="signup-business-name"
          type="text"
          placeholder={t("businessNamePlaceholder")}
          autoComplete="organization"
          aria-invalid={errors.businessName ? true : undefined}
          aria-describedby={errors.businessName ? "signup-business-name-error" : undefined}
          {...register("businessName")}
        />
        {errors.businessName ? (
          <FieldError id="signup-business-name-error">{errors.businessName.message}</FieldError>
        ) : null}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="signup-email">{t("emailLabel")}</Label>
        <Input
          id="signup-email"
          type="email"
          placeholder={t("emailPlaceholder")}
          autoComplete="username"
          aria-invalid={errors.email ? true : undefined}
          aria-describedby={errors.email ? "signup-email-error" : undefined}
          {...register("email")}
        />
        {errors.email ? <FieldError id="signup-email-error">{errors.email.message}</FieldError> : null}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="signup-password">{t("passwordLabel")}</Label>
        <PasswordInput
          id="signup-password"
          placeholder={t("passwordLabel")}
          autoComplete="new-password"
          aria-invalid={errors.password ? true : undefined}
          aria-describedby={errors.password ? "signup-password-error" : undefined}
          {...register("password", {
            onChange: (event) => setPasswordValue(event.target.value),
          })}
        />
        {showRequirements ? (
          <PasswordRequirementsList requirements={requirements} />
        ) : errors.password ? (
          // Only the length cap (`fitsPasswordLimit`) reaches here: the checklist does not track it, so without this it is all green
          // while the form stays invalid.
          <FieldError id="signup-password-error">{errors.password.message}</FieldError>
        ) : null}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="signup-confirm-password">{t("confirmPasswordLabel")}</Label>
        <PasswordInput
          id="signup-confirm-password"
          placeholder={t("confirmPasswordLabel")}
          autoComplete="new-password"
          aria-invalid={errors.confirmPassword ? true : undefined}
          aria-describedby={errors.confirmPassword ? "signup-confirm-password-error" : undefined}
          {...register("confirmPassword")}
        />
        {errors.confirmPassword ? (
          <FieldError id="signup-confirm-password-error">{errors.confirmPassword.message}</FieldError>
        ) : null}
      </div>

      <Button type="submit" size="block" disabled={!isValid || isLoading}>
        {isLoading ? t("submitting") : t("submit")}
      </Button>
    </form>
  );
}
