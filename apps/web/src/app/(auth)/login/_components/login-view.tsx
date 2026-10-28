"use client";


import type { Route } from "next";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";


import { AuthDivider } from "@/app/(auth)/_components/auth-divider";
import { AuthLogo } from "@/app/(auth)/_components/auth-logo";
import { PasswordAuthForm } from "@/app/(auth)/_components/password-auth-form";
import { SocialAuthButtons } from "@/app/(auth)/_components/social-auth-buttons";
import { OtpVerificationStage } from "@/app/(auth)/onboarding/signup/_components/otp-verification-stage";
import { ROUTES } from "@/app/_libs/constants/routes";
import { readReturnPath } from "@/app/_libs/utils/post-login-redirect";
import { MicrosoftLogo } from "@/assets/icons/microsoft-logo";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/hooks/auth/use-auth";
import { useOAuthErrorToast } from "@/hooks/auth/use-oauth-error-toast";
import { useOtpVerification } from "@/hooks/auth/use-otp-verification";
import { usePlatformSettings } from "@/hooks/common/use-platform-settings";

type LoginStep = "credentials" | "otp" | "restore";

/**
 * Tenant users only; platform admins sign in at `ROUTES.ADMIN_LOGIN`. A low-key link to it sits
 * below the sign-up prompt, since otherwise an admin on the wrong form just sees "Invalid email or
 * password" with no path off that dead end.
 *
 * The password form follows `passwordLoginEnabled`: shown unless the platform is known to have it off (the server refuses a password
 * sign-in then too, so hiding it is never the only protection). The microsoftLoginEnabled/googleLoginEnabled settings gate only the
 * buttons below it. A `pending_verification` account gets a fresh OTP from the backend instead of an error, so this screen swaps to
 * `OtpVerificationStage`; verifying there issues tokens directly (the password was already proven).
 *
 * When both SSO and social are enabled they share one row; a full-width row with a divider is for a
 * single SSO-like method alone.
 */
export function LoginView() {
  const t = useTranslations("auth.login");
  useOAuthErrorToast();
  const router = useRouter();

  /** Back to the page the visitor was headed for before being sent to sign in; onboarding always wins when nothing is connected yet. */
  const landingPath = (hasConnectedBusiness: boolean): Route =>
    hasConnectedBusiness
      ? ((readReturnPath("tenant") ?? ROUTES.DASHBOARD) as Route)
      : (ROUTES.ONBOARDING_CONNECT);
  const {
    loginWithPassword,
    restoreAccount,
    startGoogleLogin,
    startMicrosoftLogin,
    verifySignupOtp,
    resendSignupOtp,
    isLoading,
  } = useAuth();
  const tToasts = useTranslations("auth.toasts");
  const {
    data: platformSettings,
    isLoading: platformSettingsLoading,
    isError: platformSettingsError,
    refetch: refetchPlatformSettings,
  } = usePlatformSettings();
  const [step, setStep] = useState<LoginStep>("credentials");
  const [pendingEmail, setPendingEmail] = useState("");
  // Held only for the restore step (the route is public, so the password proven by the sign-in is
  // needed again); cleared on leaving the step, never persisted.
  const [restoreContext, setRestoreContext] = useState<{
    email: string;
    password: string;
    message: string;
  } | null>(null);

  // Hidden while `platformSettings` loads: these are additive, so popping in after the password
  // form is fine. A failed fetch (retry: false) defaults the same way, which is worth a visible
  // retry (see `platformSettingsError` below) because an SSO-only tenant has no password and would
  // otherwise lose their only way in silently.
  // Hidden only when the platform says so: while the settings load a placeholder holds the space (no form that then disappears), and a
  // failed fetch keeps the form, since the server decides either way and an empty card would be a dead end.
  const passwordEnabled = platformSettings?.passwordLoginEnabled !== false;
  const showPasswordForm = !platformSettingsLoading && passwordEnabled;
  const ssoEnabled = platformSettings?.microsoftLoginEnabled ?? false;
  const socialEnabled = platformSettings?.googleLoginEnabled ?? false;
  const bothSsoLike = ssoEnabled && socialEnabled;
  const anySsoLike = ssoEnabled || socialEnabled;

  const handlePasswordSubmit = async (email: string, password: string) => {
    const result = await loginWithPassword(email, password);
    if (!result) return;

    if (result.kind === "verify_needed") {
      setPendingEmail(result.email);
      setStep("otp");
      return;
    }

    if (result.kind === "scheduled_for_deletion") {
      setRestoreContext({ email, password, message: result.message });
      setStep("restore");
      return;
    }

    // Drops the router cache so the destination renders with the locale cookie sign-in may have
    // just restored (`AuthService.loginWithPassword`); see `AdminLoginView`.
    router.refresh();
    router.push(landingPath(result.hasConnectedBusiness));
  };

  const leaveRestore = () => {
    setRestoreContext(null);
    setStep("credentials");
  };

  const handleRestore = async () => {
    if (!restoreContext) return;
    const { email, password } = restoreContext;
    if (!(await restoreAccount(email, password))) return;

    toast.success(tToasts("restored"));
    setRestoreContext(null);
    setStep("credentials");
    await handlePasswordSubmit(email, password);
  };

  const { handleVerify: handleVerifyOtp, handleResend: handleResendOtp } = useOtpVerification({
    email: pendingEmail,
    verifySignupOtp,
    resendSignupOtp,
    onVerified: (hasConnectedBusiness) => router.push(landingPath(hasConnectedBusiness)),
  });

  return (
    <>
      <AuthLogo />

      <div className="animate-in fade-in slide-in-from-bottom-2 fill-mode-backwards p-fluid-page border-border bg-card shadow-elevated ease-fluid w-full max-w-[420px] rounded-xl border duration-500">
        {step === "credentials" ? (
          <>
            <h1 className="text-gradient mb-7 text-center text-xl font-semibold">{t("title")}</h1>

            {platformSettingsLoading ? (
              <div className="flex flex-col gap-4" data-testid="login-form-loading">
                <Skeleton className="h-10 w-full rounded-md" />
                <Skeleton className="h-10 w-full rounded-md" />
                <Skeleton className="h-10 w-full rounded-md" />
              </div>
            ) : null}

            {showPasswordForm ? (
              <PasswordAuthForm
                isLoading={isLoading}
                onSubmit={(email, password) => void handlePasswordSubmit(email, password)}
              />
            ) : null}

            {anySsoLike ? (
              <>
                {showPasswordForm ? <AuthDivider label={t("orDivider")} /> : null}

                {bothSsoLike ? (
                  <div className="grid grid-cols-2 gap-3">
                    <Button
                      type="button"
                      variant="outline"
                      size="block"
                      disabled={isLoading}
                      onClick={startMicrosoftLogin}>
                      <MicrosoftLogo />
                      {t("microsoft")}
                    </Button>
                    <SocialAuthButtons
                      isLoading={isLoading}
                      onGoogleClick={startGoogleLogin}
                      label={t("google")}
                    />
                  </div>
                ) : (
                  <>
                    {ssoEnabled ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="block"
                        disabled={isLoading}
                        onClick={startMicrosoftLogin}>
                        <MicrosoftLogo />
                        {t("continueWithMicrosoft")}
                      </Button>
                    ) : null}

                    {socialEnabled ? (
                      <SocialAuthButtons
                        isLoading={isLoading}
                        onGoogleClick={startGoogleLogin}
                        label={t("continueWithGoogle")}
                      />
                    ) : null}
                  </>
                )}
              </>
            ) : platformSettingsError ? (
              <div className="mt-6 flex flex-col items-center gap-2 text-center">
                <p className="text-muted-foreground text-[13px]">{t("ssoUnavailable")}</p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => void refetchPlatformSettings()}>
                  {t("ssoUnavailableRetry")}
                </Button>
              </div>
            ) : null}

            <div className="text-muted-foreground mt-6 text-center text-sm">
              {t("noAccount")}{" "}
              <Link href={ROUTES.ONBOARDING_SIGNUP} className="font-medium text-primary underline underline-offset-4">
                {t("signUp")}
              </Link>
            </div>

            <div className="text-muted-foreground mt-2 text-center text-xs">
              {t("platformAdmin")}{" "}
              <Link href={ROUTES.ADMIN_LOGIN} className="font-medium text-primary underline underline-offset-4">
                {t("adminSignIn")}
              </Link>
            </div>
          </>
        ) : step === "restore" && restoreContext ? (
          <div className="flex flex-col gap-5">
            <h1 className="text-gradient text-center text-xl font-semibold">
              {t("scheduledForDeletion.title")}
            </h1>
            <p className="text-muted-foreground text-center text-sm">{restoreContext.message}</p>
            <Button
              type="button"
              size="block"
              disabled={isLoading}
              onClick={() => void handleRestore()}>
              {isLoading ? t("scheduledForDeletion.restoring") : t("scheduledForDeletion.restore")}
            </Button>
            <Button type="button" variant="ghost" size="block" onClick={leaveRestore}>
              {t("scheduledForDeletion.back")}
            </Button>
          </div>
        ) : (
          <OtpVerificationStage
            email={pendingEmail}
            isLoading={isLoading}
            onVerify={handleVerifyOtp}
            onResend={() => void handleResendOtp()}
          />
        )}
      </div>
    </>
  );
}
