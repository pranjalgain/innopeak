"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";

import { MicrosoftSsoForm } from "@/app/(auth)/_components/microsoft-sso-form";
import { ROUTES } from "@/app/_libs/constants/routes";
import { useAuth } from "@/hooks/auth/use-auth";

/**
 * Mock Microsoft sign-in step. There is no real Entra ID app registered yet
 * (see apps/documentation/docs/backend/auth/api-reference.md) — this stands
 * in for the redirect-to-Microsoft-and-back OAuth round trip so the login
 * flow can be demoed end-to-end. Any email/password is accepted; submitting
 * calls the same `useAuth().loginWithMicrosoft()` the real integration will
 * use once it exists.
 */
export function MockMicrosoftSsoView() {
  const t = useTranslations("auth.microsoftMock");
  const { loginWithMicrosoft, isLoading } = useAuth();

  return (
    <div className="animate-in fade-in slide-in-from-bottom-2 fill-mode-backwards p-fluid-page w-full max-w-[380px] rounded-xl border border-border bg-card shadow-elevated duration-500 ease-fluid">
      <MicrosoftSsoForm isLoading={isLoading} onSubmit={(email) => void loginWithMicrosoft(email)} />

      <div className="mt-6 text-center text-sm text-muted-foreground">
        <Link href={ROUTES.LOGIN} className="font-medium">
          {t("backToLogin")}
        </Link>
      </div>
    </div>
  );
}
