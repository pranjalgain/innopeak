"use client";

import type { Route } from "next";
import Link from "next/link";
import { useTranslations } from "next-intl";

import { AuthDivider } from "@/app/(auth)/_components/auth-divider";
import { AuthLogo } from "@/app/(auth)/_components/auth-logo";
import { PasswordAuthForm } from "@/app/(auth)/_components/password-auth-form";
import { SocialAuthButtons } from "@/app/(auth)/_components/social-auth-buttons";
import { AUTH_METHODS } from "@/app/_libs/constants/auth-methods";
import { ROUTES } from "@/app/_libs/constants/routes";
import { MicrosoftLogo } from "@/assets/icons/microsoft-logo";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/auth/use-auth";

/**
 * Login screen — which methods render is env-gated via `AUTH_METHODS`
 * (`NEXT_PUBLIC_AUTH_*_ENABLED`) so different configurations can be tested
 * without a code change. Microsoft SSO is the only one enabled by default,
 * matching `innopeak-design.html`'s Login artboard.
 *
 * When both SSO and social are enabled, they sit side by side in one row
 * at the bottom (short "Microsoft"/"Google" labels) rather than each
 * getting a full-width row with a divider of its own — that layout is
 * reserved for a single SSO-like method standing alone.
 */
export function LoginView() {
  const t = useTranslations("auth.login");
  const { loginWithPassword, loginWithSocial, isLoading } = useAuth();

  const bothSsoLike = AUTH_METHODS.sso && AUTH_METHODS.social;

  return (
    <>
      <AuthLogo />

      <div className="animate-in fade-in slide-in-from-bottom-2 fill-mode-backwards p-fluid-page w-full max-w-[420px] rounded-xl border border-border bg-card shadow-elevated duration-500 ease-fluid">
        <h1 className="text-gradient mb-2 text-center text-xl font-semibold">{t("title")}</h1>
        <p className="mb-7 text-center text-sm text-muted-foreground">{t("subtitle")}</p>

        {AUTH_METHODS.password ? <PasswordAuthForm isLoading={isLoading} onSubmit={loginWithPassword} /> : null}

        {AUTH_METHODS.password && (AUTH_METHODS.sso || AUTH_METHODS.social) ? (
          <AuthDivider label={t("orDivider")} />
        ) : null}

        {bothSsoLike ? (
          <div className="grid grid-cols-2 gap-3">
            <Button asChild variant="outline" size="block">
              <Link href={ROUTES.LOGIN_MICROSOFT}>
                <MicrosoftLogo />
                {t("microsoft")}
              </Link>
            </Button>
            <SocialAuthButtons
              isLoading={isLoading}
              onGoogleClick={() => void loginWithSocial()}
              label={t("google")}
            />
          </div>
        ) : (
          <>
            {AUTH_METHODS.sso ? (
              <Button asChild variant="outline" size="block">
                <Link href={ROUTES.LOGIN_MICROSOFT}>
                  <MicrosoftLogo />
                  {t("continueWithMicrosoft")}
                </Link>
              </Button>
            ) : null}

            {AUTH_METHODS.social ? (
              <SocialAuthButtons
                isLoading={isLoading}
                onGoogleClick={() => void loginWithSocial()}
                label={t("continueWithGoogle")}
              />
            ) : null}
          </>
        )}

        <div className="mt-6 text-center text-sm text-muted-foreground">
          {t("noAccount")}{" "}
          <Link href={ROUTES.ONBOARDING_SIGNUP as Route} className="font-medium">
            {t("signUp")}
          </Link>
        </div>
      </div>
    </>
  );
}
