"use client";


import Link from "next/link";

import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";



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
import { PendingSignupService } from "@/app/_libs/services/pending-signup.service";
import { MicrosoftLogo } from "@/assets/icons/microsoft-logo";
import { LoadErrorState } from "@/components/common/load-error-state";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/hooks/auth/use-auth";
import { useOAuthErrorToast } from "@/hooks/auth/use-oauth-error-toast";
import { useOtpVerification } from "@/hooks/auth/use-otp-verification";
import { usePlatformSettings } from "@/hooks/common/use-platform-settings";
import { useHandOffAfterSignup, useOnboardingSteps } from "@/hooks/onboarding/use-onboarding-steps";

/** Steps 1-2 only. Steps 3-4 ("plan", "connect") live on their own routes — see `handOffToPlan`. */
type SignupStep = Extract<OnboardingStep, "identity" | "otp">;


/**
 * Steps 1-2 of onboarding; steps 3-4 live on their own routes (see `handOffToPlan`). Step 4 is a Google OAuth grant that
 * leaves the app, and `/onboarding/signup` is in `proxy.ts`'s REDIRECT_IF_AUTHENTICATED_PATHS, so an authenticated user
 * returning here would bounce to /dashboard. Handing off by route also leaves no wizard state to lose across the round trip.
 */
export function OnboardingSignupView() {
  const t = useTranslations("onboardingSignup");
  const tLogin = useTranslations("auth.login");
  useOAuthErrorToast();
  const {
    signupWithPassword,
    startGoogleSignup,
    startMicrosoftSignup,
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

  // A refresh (or Back/Forward) on the OTP step must resume it: re-submitting the form is refused, the account exists.
  useEffect(() => {
    const pendingEmail = PendingSignupService.get();
    if (!pendingEmail) return;
    setViaPassword(true);
    setSignupEmail(pendingEmail);
    setStep("otp");
  }, []);

  const authMethods = {
    sso: platformSettings?.microsoftLoginEnabled ?? false,
    password: platformSettings?.passwordLoginEnabled ?? false,
    social: platformSettings?.googleLoginEnabled ?? false,
  };
  const bothSsoLike = authMethods.sso && authMethods.social;
  const stepperSteps = useOnboardingSteps(viaPassword);

  /** Hands off to /onboarding/plan so every fresh signup sees the Free/Paid choice before the location-picker (straight to connect when
   *  payments are off, see `useHandOffAfterSignup`). */
  const handOffToPlan = useHandOffAfterSignup();

  const handlePasswordSubmit = async (values: CreateAccountFormValues) => {
    const succeeded = await signupWithPassword(values);
    if (succeeded) {
      PendingSignupService.set(values.email);
      setViaPassword(true);
      setSignupEmail(values.email);
      setStep("otp");
    }
  };

  const handleChangeEmail = () => {
    PendingSignupService.clear();
    setViaPassword(false);
    setSignupEmail("");
    setStep("identity");
  };

  const { handleVerify: handleVerifyOtp, handleResend: handleResendOtp } = useOtpVerification({
    email: signupEmail,
    verifySignupOtp,
    resendSignupOtp,
    // A brand-new account has no Google Business Profile yet, so go straight to the plan step (unlike login's OTP branch).
    onVerified: () => {
      PendingSignupService.clear();
      handOffToPlan("password");
    },
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
                      disabled={isLoading}
                      onClick={startMicrosoftSignup}>
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
                        onClick={startMicrosoftSignup}>
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
              onVerify={handleVerifyOtp}
              onResend={() => void handleResendOtp()}
              onChangeEmail={handleChangeEmail}
            />
          ) : null}
        </div>
      </div>
    </>
  );
}
