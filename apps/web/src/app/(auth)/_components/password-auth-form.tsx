"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { useMemo } from "react";

import { useForm } from "react-hook-form";

import {
  type PasswordAuthFields,
  passwordAuthSchema,
} from "@/app/(auth)/_schemas/password-auth.schema";
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

const FIELD_ERROR_CLASS = "text-[12.5px] text-destructive";

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
  const t = useTranslations("auth.passwordMock");
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
          {...register("email")}
        />
        {errors.email ? <p className={FIELD_ERROR_CLASS}>{errors.email.message}</p> : null}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="password-auth-password">{t("passwordLabel")}</Label>
        <PasswordInput
          id="password-auth-password"
          placeholder="••••••••"
          autoComplete="current-password"
          {...register("password")}
        />
        {errors.password ? <p className={FIELD_ERROR_CLASS}>{errors.password.message}</p> : null}
      </div>

      <Button type="submit" size="block" disabled={!isValid || isLoading}>
        {isLoading ? (submittingLabel ?? t("signingIn")) : (submitLabel ?? t("signIn"))}
      </Button>
    </form>
  );
}
