"use client";


import Link from "next/link";
import { useRouter } from "next/navigation";

import { useTranslations } from "next-intl";
import { useCallback, useState } from "react";



import { AuthDivider } from "@/app/(auth)/_components/auth-divider";
import { AuthLogo } from "@/app/(auth)/_components/auth-logo";
import { SocialAuthButtons } from "@/app/(auth)/_components/social-auth-buttons";
import type { OnboardingStep } from "@/app/(auth)/onboarding/_components/onboarding-step.types";
import { OnboardingStepper } from "@/app/(auth)/onboarding/_components/onboarding-stepper";
import {
  CreateAccountForm,
  type CreateAccountFormValues,
} from "@/app/(auth)/onboarding/signup/_components/create-account-form";
import { OtpVerificationStage } from "@/app/(auth)/onboarding/signup/_components/otp-verification-stage";
import { ROUTES } from "@/app/_libs/constants/routes";
import { OnboardingContextService } from "@/app/_libs/services/onboarding-context.service";
import { MicrosoftLogo } from "@/assets/icons/microsoft-logo";
import { LoadErrorState } from "@/components/common/load-error-state";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/hooks/auth/use-auth";
import { useOAuthErrorToast } from "@/hooks/auth/use-oauth-error-toast";
import { useOtpVerification } from "@/hooks/auth/use-otp-verification";
import { usePlatformSettings } from "@/hooks/common/use-platform-settings";

/** Steps 1-2 only. Step 3 ("connect") lives on its own route — see `handOffToConnect`. */
type SignupStep = Extract<OnboardingStep, "identity" | "otp">;

const SSO_LIKE_STEPS: OnboardingStep[] = ["identity", "connect"];
const PASSWORD_STEPS: OnboardingStep[] = ["identity", "otp", "connect"];

/**
 * Steps 1-2 of onboarding: prove who is signing up, then (password path only) verify the email.
 * Step 3 is **not** rendered here — it navigates to `/onboarding/connect`.
 *
 * That split is forced, not stylistic. Step 3 is a real Google OAuth grant, which means the
 * browser leaves the app entirely and comes back through the backend's callback. This route cannot
 * survive that: `/onboarding/signup` is in `proxy.ts`'s REDIRECT_IF_AUTHENTICATED_PATHS, and by
 * step 3 the user *is* authenticated, so any full navigation back here bounces to /dashboard. The
 * previous shape only worked because the mocked connect flow never navigated anywhere.
 *
 * Handing off by route rather than persisting wizard state also means there is no in-memory state
 * left to lose across the round trip, and the connect flow exists in exactly one place instead of
 * being rendered by two views that must be kept in step.
 */
export function OnboardingSignupView() {
  const t = useTranslations("onboardingSignup");
  const tLogin = useTranslations("auth.login");
  useOAuthErrorToast();
  const router = useRouter();
  const {
    signupWithMicrosoft,
    signupWithPassword,
    startGoogleSignup,
    verifySignupOtp,
    resendSignupOtp,
    isLoading,
  } = useAuth();
  const {
    data: platformSettings,
    isLoading: platformSettingsLoading,
    isError: platformSettingsError,
    refetch: refetchPlatformSettings,
  } = usePlatformSettings();
  const [step, setStep] = useState<SignupStep>("identity");
  const [viaPassword, setViaPassword] = useState(false);
  const [signupEmail, setSignupEmail] = useState("");

  const authMethods = {
    sso: platformSettings?.ssoLoginEnabled ?? false,
    password: platformSettings?.passwordLoginEnabled ?? false,
    social: platformSettings?.socialLoginEnabled ?? false,
  };
  const bothSsoLike = authMethods.sso && authMethods.social;
  const stepperSteps = viaPassword ? PASSWORD_STEPS : SSO_LIKE_STEPS;

  /**
   * `replace`, not `push`: the signup screen must not be reachable with the Back button once an
   * account exists — going back would land an authenticated user on a route that immediately
   * bounces them to /dashboard, which reads as the app losing their place mid-onboarding.
   */
  const handOffToConnect = useCallback(
    (via: "password" | "sso") => {
      OnboardingContextService.set({ from: "signup", via });
      router.replace(ROUTES.ONBOARDING_CONNECT);
    },
    [router],
  );

  const handleSsoSubmit = async () => {
    const succeeded = await signupWithMicrosoft();
    if (succeeded) handOffToConnect("sso");
  };

  const handlePasswordSubmit = async (values: CreateAccountFormValues) => {
    const succeeded = await signupWithPassword(values);
    if (succeeded) {
      setViaPassword(true);
      setSignupEmail(values.email);
      setStep("otp");
    }
  };

  const { handleVerify: handleVerifyOtp, handleResend: handleResendOtp } = useOtpVerification({
    email: signupEmail,
    verifySignupOtp,
    resendSignupOtp,
    // A brand-new account never has a Google Business Profile connected yet — always straight to
    // the connect step, unlike login's OTP branch which checks hasConnectedBusiness.
    onVerified: () => handOffToConnect("password"),
  });

  return (
    <>
      <AuthLogo />

      <div className="flex w-full max-w-[460px] flex-col items-center gap-6">
        <OnboardingStepper steps={stepperSteps} currentStep={step} />

        <div className="animate-in fade-in slide-in-from-bottom-2 fill-mode-backwards p-fluid-page border-border bg-card shadow-elevated ease-fluid w-full rounded-xl border duration-500">
          {step === "identity" ? (
            platformSettingsError ? (
              <LoadErrorState onRetry={() => void refetchPlatformSettings()} />
            ) : platformSettingsLoading || !platformSettings ? (
              <div className="flex flex-col gap-4">
                <Skeleton className="mb-2 h-4 w-full" />
                <Skeleton className="h-10 w-full rounded-md" />
                <Skeleton className="h-10 w-full rounded-md" />
                <Skeleton className="h-10 w-full rounded-md" />
              </div>
            ) : (
              <>
                <p className="text-muted-foreground mb-6 text-center text-sm">{t("subtitle")}</p>

                {authMethods.password ? (
                  <CreateAccountForm
                    isLoading={isLoading}
                    onSubmit={(values) => void handlePasswordSubmit(values)}
                  />
                ) : null}

                {authMethods.password && (authMethods.sso || authMethods.social) ? (
                  <AuthDivider label={tLogin("orDivider")} />
                ) : null}

                {bothSsoLike ? (
                  <div className="grid grid-cols-2 gap-3">
                    <Button
                      type="button"
                      variant="outline"
                      size="block"
                      onClick={() => void handleSsoSubmit()}>
                      <MicrosoftLogo />
                      {tLogin("microsoft")}
                    </Button>
                    <SocialAuthButtons
                      isLoading={isLoading}
                      onGoogleClick={startGoogleSignup}
                      label={tLogin("google")}
                    />
                  </div>
                ) : (
                  <>
                    {authMethods.sso ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="block"
                        disabled={isLoading}
                        onClick={() => void handleSsoSubmit()}>
                        <MicrosoftLogo />
                        {tLogin("continueWithMicrosoft")}
                      </Button>
                    ) : null}

                    {authMethods.social ? (
                      <SocialAuthButtons
                        isLoading={isLoading}
                        onGoogleClick={startGoogleSignup}
                        label={tLogin("continueWithGoogle")}
                      />
                    ) : null}
                  </>
                )}

                {/* Identity step only — offering "sign in" mid-OTP would abandon a half-created account. */}
                <div className="text-muted-foreground mt-6 text-center text-sm">
                  {t("haveAccount")}{" "}
                  <Link href={ROUTES.LOGIN} className="font-medium">
                    {t("signIn")}
                  </Link>
                </div>
              </>
            )
          ) : null}

          {step === "otp" ? (
            <OtpVerificationStage
              email={signupEmail}
              isLoading={isLoading}
              onVerify={(code) => void handleVerifyOtp(code)}
              onResend={() => void handleResendOtp()}
            />
          ) : null}
        </div>
      </div>
    </>
  );
}
