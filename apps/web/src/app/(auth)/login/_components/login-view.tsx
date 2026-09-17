"use client";


import type { Route } from "next";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { useTranslations } from "next-intl";
import { useState } from "react";


import { AuthDivider } from "@/app/(auth)/_components/auth-divider";
import { AuthLogo } from "@/app/(auth)/_components/auth-logo";
import { PasswordAuthForm } from "@/app/(auth)/_components/password-auth-form";
import { SocialAuthButtons } from "@/app/(auth)/_components/social-auth-buttons";
import { OtpVerificationStage } from "@/app/(auth)/onboarding/signup/_components/otp-verification-stage";
import { ROUTES } from "@/app/_libs/constants/routes";
import { MicrosoftLogo } from "@/assets/icons/microsoft-logo";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/auth/use-auth";
import { useOAuthErrorToast } from "@/hooks/auth/use-oauth-error-toast";
import { useOtpVerification } from "@/hooks/auth/use-otp-verification";
import { usePlatformSettings } from "@/hooks/common/use-platform-settings";

type LoginStep = "credentials" | "otp";

/**
 * Login screen — the password form is always available, unconditionally, regardless of the
 * platform's ssoLoginEnabled/passwordLoginEnabled/socialLoginEnabled settings. Those settings
 * gate only the SSO/social *buttons* below it. This is deliberate, not an oversight: this shared
 * screen is the one place both tenant and admin credentials are submitted — the backend decides
 * which after the fact (`AuthService.login` checks `platform_admins` first). Gating the password
 * field itself behind `passwordLoginEnabled`, as an earlier version of this screen did, meant a
 * Super Admin disabling "Email & password" from Admin Settings locked every admin — including
 * themselves — out of the UI with no way back in.
 *
 * **Admins can now have a Google identity too** (`platform_admin_identities`, written when an
 * invite is accepted through `GET /v1/auth/invite/:token/google` and read back by the shared
 * Google callback), which inverts part of the reasoning above: an admin who accepted that way has
 * NO password at all, so for them the Google button below is the only way in — and it is gated
 * behind `socialLoginEnabled`.
 *
 * Both ends of that are closed, so the button below staying gated is safe: the invite accept
 * screen reads the same setting (so a Google-only admin cannot be *created* while Google sign-in
 * is off), and `AdminSettingsService.updatePlatformSettings` refuses to switch it off while any
 * active admin has Google as their only credential — the same lockout-prevention family as the
 * last-active-admin guard. Still worth revisiting if Google-only admins become common: giving
 * admins their own "add a password" path would remove the single-credential situation entirely,
 * rather than guarding around it. There is no admin equivalent of the tenant `set-password` flow
 * today, and `AdminSettingsService.changePassword` requires a current password it does not have.
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
  useOAuthErrorToast();
  const router = useRouter();
  const { loginWithPassword, startGoogleLogin, verifySignupOtp, resendSignupOtp, isLoading } =
    useAuth();
  const {
    data: platformSettings,
    isError: platformSettingsError,
    refetch: refetchPlatformSettings,
  } = usePlatformSettings();
  const [step, setStep] = useState<LoginStep>("credentials");
  const [pendingEmail, setPendingEmail] = useState("");

  // Defaults to hidden while `platformSettings` is still loading — these are additive
  // conveniences, so popping in a beat after the (always-present) password form is a non-issue,
  // unlike blocking the whole screen on this fetch the way an earlier version did. A *failed*
  // fetch (retry: false, never recovers on its own) defaults the same way, which is the one case
  // worth a visible retry rather than just quietly staying hidden below: an SSO-only tenant has no
  // password, so a persistently-hidden SSO button is that tenant's only way in going dark with no
  // explanation. See the retry affordance rendered for `platformSettingsError` below.
  const ssoEnabled = platformSettings?.ssoLoginEnabled ?? false;
  const socialEnabled = platformSettings?.socialLoginEnabled ?? false;
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

    if (result.kind === "admin_success") {
      router.push(ROUTES.ADMIN);
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

      <div className="animate-in fade-in slide-in-from-bottom-2 fill-mode-backwards p-fluid-page border-border bg-card shadow-elevated ease-fluid w-full max-w-[420px] rounded-xl border duration-500">
        {step === "credentials" ? (
          <>
            <h1 className="text-gradient mb-7 text-center text-xl font-semibold">{t("title")}</h1>

            <PasswordAuthForm
              isLoading={isLoading}
              onSubmit={(email, password) => void handlePasswordSubmit(email, password)}
            />

            {anySsoLike ? (
              <>
                <AuthDivider label={t("orDivider")} />

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
                      onGoogleClick={startGoogleLogin}
                      label={t("google")}
                    />
                  </div>
                ) : (
                  <>
                    {ssoEnabled ? (
                      <Button asChild variant="outline" size="block">
                        <Link href={ROUTES.LOGIN_MICROSOFT}>
                          <MicrosoftLogo />
                          {t("continueWithMicrosoft")}
                        </Link>
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
