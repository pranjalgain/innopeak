"use client";

import type { Route } from "next";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import * as React from "react";

import { AuthDivider } from "@/app/(auth)/_components/auth-divider";
import { AuthLogo } from "@/app/(auth)/_components/auth-logo";
import { PasswordAuthForm } from "@/app/(auth)/_components/password-auth-form";
import { SocialAuthButtons } from "@/app/(auth)/_components/social-auth-buttons";
import { OtpVerificationStage } from "@/app/(auth)/onboarding/signup/_components/otp-verification-stage";
import { AUTH_METHODS } from "@/app/_libs/constants/auth-methods";
import { ROUTES } from "@/app/_libs/constants/routes";
import { MicrosoftLogo } from "@/assets/icons/microsoft-logo";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/auth/use-auth";
import { useOtpVerification } from "@/hooks/auth/use-otp-verification";

type LoginStep = "credentials" | "otp";

/**
 * Login screen — which methods render is env-gated via `AUTH_METHODS`
 * (`NEXT_PUBLIC_AUTH_*_ENABLED`) so different configurations can be tested
 * without a code change. Microsoft SSO is the only one enabled by default,
 * matching `innopeak-design.html`'s Login artboard.
 *
 * The password path can land on a still-`pending_verification` account —
 * the backend resends a fresh OTP and reports that instead of erroring, so
 * this screen swaps to the same `OtpVerificationStage` the signup wizard
 * uses rather than showing a login error. Verifying there issues tokens
 * directly (this login attempt already proved the password), and routes on
 * to the dashboard or the connect-business stepper depending on whether
 * this tenant has already connected a Google Business Profile.
 *
 * When both SSO and social are enabled, they sit side by side in one row
 * at the bottom (short "Microsoft"/"Google" labels) rather than each
 * getting a full-width row with a divider of its own — that layout is
 * reserved for a single SSO-like method standing alone.
 */
export function LoginView() {
  const t = useTranslations("auth.login");
  const router = useRouter();
  const { loginWithPassword, loginWithSocial, verifySignupOtp, resendSignupOtp, isLoading } = useAuth();
  const [step, setStep] = React.useState<LoginStep>("credentials");
  const [pendingEmail, setPendingEmail] = React.useState("");

  const bothSsoLike = AUTH_METHODS.sso && AUTH_METHODS.social;

  const handlePasswordSubmit = async (email: string, password: string) => {
    const result = await loginWithPassword(email, password);
    if (!result) return;

    if (result.kind === "verify_needed") {
      setPendingEmail(result.email);
      setStep("otp");
      return;
    }

    router.push(result.hasConnectedBusiness ? ROUTES.DASHBOARD : ROUTES.ONBOARDING_CONNECT);
  };

  const { handleVerify: handleVerifyOtp, handleResend: handleResendOtp } = useOtpVerification({
    email: pendingEmail,
    verifySignupOtp,
    resendSignupOtp,
    onVerified: (hasConnectedBusiness) =>
      router.push(hasConnectedBusiness ? ROUTES.DASHBOARD : ROUTES.ONBOARDING_CONNECT),
  });

  return (
    <>
      <AuthLogo />

      <div className="animate-in fade-in slide-in-from-bottom-2 fill-mode-backwards p-fluid-page w-full max-w-[420px] rounded-xl border border-border bg-card shadow-elevated duration-500 ease-fluid">
        {step === "credentials" ? (
          <>
            <h1 className="text-gradient mb-2 text-center text-xl font-semibold">{t("title")}</h1>
            <p className="mb-7 text-center text-sm text-muted-foreground">{t("subtitle")}</p>

            {AUTH_METHODS.password ? (
              <PasswordAuthForm isLoading={isLoading} onSubmit={(email, password) => void handlePasswordSubmit(email, password)} />
            ) : null}

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
          </>
        ) : (
          <OtpVerificationStage
            email={pendingEmail}
            isLoading={isLoading}
            onVerify={(code) => void handleVerifyOtp(code)}
            onResend={() => void handleResendOtp()}
          />
        )}
      </div>
    </>
  );
}
