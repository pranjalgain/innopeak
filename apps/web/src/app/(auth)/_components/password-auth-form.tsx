"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { useMemo } from "react";

import { useForm } from "react-hook-form";

import {
  type PasswordAuthFields,
  passwordAuthSchema,
} from "@/app/(auth)/_schemas/password-auth.schema";
import { FieldError } from "@/components/common/field-error";
import { PasswordInput } from "@/components/common/password-input";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";


interface PasswordAuthFormProps {
  isLoading: boolean;
  onSubmit: (email: string, password: string) => void;
  submitLabel?: string;
  submittingLabel?: string;
}

/**
 * Never gated behind `passwordLoginEnabled`; shared by `LoginView` and `AdminLoginView`.
 * The password is only checked for presence: sign-in must not enforce the signup rules (see the schema).
 */
export function PasswordAuthForm({
  isLoading,
  onSubmit,
  submitLabel,
  submittingLabel,
}: PasswordAuthFormProps) {
  const t = useTranslations("auth.passwordForm");
  const schema = useMemo(() => passwordAuthSchema(t), [t]);

  const {
    register,
    handleSubmit,
    formState: { errors, isValid },
  } = useForm<PasswordAuthFields>({
    resolver: zodResolver(schema),
    mode: "onTouched",
    defaultValues: { email: "", password: "" },
  });

  const submit = handleSubmit((values) => onSubmit(values.email, values.password));

  return (
    <form className="flex flex-col gap-4" onSubmit={submit} noValidate>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="password-auth-email">{t("emailLabel")}</Label>
        <Input
          id="password-auth-email"
          type="email"
          placeholder={t("emailPlaceholder")}
          autoComplete="username"
          aria-invalid={errors.email ? true : undefined}
          aria-describedby={errors.email ? "password-auth-email-error" : undefined}
          {...register("email")}
        />
        {errors.email ? <FieldError id="password-auth-email-error">{errors.email.message}</FieldError> : null}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="password-auth-password">{t("passwordLabel")}</Label>
        <PasswordInput
          id="password-auth-password"
          placeholder="••••••••"
          autoComplete="current-password"
          aria-invalid={errors.password ? true : undefined}
          aria-describedby={errors.password ? "password-auth-password-error" : undefined}
          {...register("password")}
        />
        {errors.password ? <FieldError id="password-auth-password-error">{errors.password.message}</FieldError> : null}
      </div>

      <Button type="submit" size="block" disabled={!isValid || isLoading}>
        {isLoading ? (submittingLabel ?? t("signingIn")) : (submitLabel ?? t("signIn"))}
      </Button>
    </form>
  );
}
