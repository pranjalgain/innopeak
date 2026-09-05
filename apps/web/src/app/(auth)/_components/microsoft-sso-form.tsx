"use client";

import { useTranslations } from "next-intl";
import * as React from "react";

import { MicrosoftLogo } from "@/assets/icons/microsoft-logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface MicrosoftSsoFormProps {
  isLoading: boolean;
  onSubmit: (email: string) => void;
}

/**
 * The mock Microsoft sign-in fields (icon, title, notice, email/password,
 * submit) shared by the Login flow's `/login/microsoft` step and Signup's
 * step 1 — the two differ only in what happens after submit (Login redirects
 * straight to the dashboard; Signup advances to step 2), so that behavior
 * stays with each caller via `onSubmit` rather than living here.
 */
export function MicrosoftSsoForm({ isLoading, onSubmit }: MicrosoftSsoFormProps) {
  const t = useTranslations("auth.microsoftMock");
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");

  const canSubmit = email.trim() !== "" && password.trim() !== "" && !isLoading;

  return (
    <>
      <div className="mb-6 flex flex-col items-center gap-3 text-center">
        <MicrosoftLogo size={20} />
        <h1 className="text-lg font-semibold">{t("title")}</h1>
        <p className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">{t("notice")}</p>
      </div>

      <form
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit(email);
        }}
      >
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="mock-sso-email">{t("emailLabel")}</Label>
          <Input
            id="mock-sso-email"
            type="email"
            placeholder={t("emailPlaceholder")}
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            autoComplete="username"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="mock-sso-password">{t("passwordLabel")}</Label>
          <Input
            id="mock-sso-password"
            type="password"
            placeholder="••••••••"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="current-password"
          />
        </div>

        <Button type="submit" size="block" className="mt-2" disabled={!canSubmit}>
          {isLoading ? t("signingIn") : t("signIn")}
        </Button>
      </form>
    </>
  );
}
