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
  /** Overrides the submit button's label — e.g. "Sign up"/"Signing up…" when this form is reused on the signup screen. Defaults to "Sign in"/"Signing in…". */
  submitLabel?: string;
  submittingLabel?: string;
}

const FIELD_ERROR_CLASS = "text-[12.5px] text-destructive";

/**
 * Email/password fields for login — always rendered, never gated behind the platform's
 * passwordLoginEnabled setting. Shared by the tenant `LoginView` and the platform-admin
 * `AdminLoginView`. The submit label is overridable via `submitLabel`/`submittingLabel`.
 *
 * Validated client-side against `_schemas/password-auth.schema.ts` so a malformed address is
 * caught here rather than spending a round trip to earn a 400. The password is only checked for
 * presence — see the schema for why sign-in must not enforce the signup rules.
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
