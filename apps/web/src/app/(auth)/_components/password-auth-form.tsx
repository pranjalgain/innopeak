"use client";

import { useTranslations } from "next-intl";
import * as React from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface PasswordAuthFormProps {
  isLoading: boolean;
  onSubmit: (email: string) => void;
  /** Overrides the submit button's label — e.g. "Sign up"/"Signing up…" when this form is reused on the signup screen. Defaults to "Sign in"/"Signing in…". */
  submitLabel?: string;
  submittingLabel?: string;
}

/**
 * Mock email/password fields — gated behind `AUTH_METHODS.password`, off by
 * default since Microsoft SSO is this app's primary sign-in method. No real
 * validation beyond non-empty, matching `MicrosoftSsoForm`'s mock rigor.
 * Shared between login and signup — the submit label is overridable since
 * "Sign in" wouldn't make sense on the signup screen.
 */
export function PasswordAuthForm({ isLoading, onSubmit, submitLabel, submittingLabel }: PasswordAuthFormProps) {
  const t = useTranslations("auth.passwordMock");
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");

  const canSubmit = email.trim() !== "" && password.trim() !== "" && !isLoading;

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit(email);
      }}
    >
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="password-auth-email">{t("emailLabel")}</Label>
        <Input
          id="password-auth-email"
          type="email"
          placeholder={t("emailPlaceholder")}
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          autoComplete="username"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="password-auth-password">{t("passwordLabel")}</Label>
        <Input
          id="password-auth-password"
          type="password"
          placeholder="••••••••"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          autoComplete="current-password"
        />
      </div>

      <Button type="submit" size="block" disabled={!canSubmit}>
        {isLoading ? (submittingLabel ?? t("signingIn")) : (submitLabel ?? t("signIn"))}
      </Button>
    </form>
  );
}
