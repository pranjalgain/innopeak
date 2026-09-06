"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import * as React from "react";
import { toast } from "sonner";

import { AuthDivider } from "@/app/(auth)/_components/auth-divider";
import { AuthLogo } from "@/app/(auth)/_components/auth-logo";
import { SocialAuthButtons } from "@/app/(auth)/_components/social-auth-buttons";
import { BackfillingStage } from "@/app/(auth)/onboarding/connect/_components/backfilling-stage";
import { ConfirmLocationStage } from "@/app/(auth)/onboarding/connect/_components/confirm-location-stage";
import { ConnectStage } from "@/app/(auth)/onboarding/connect/_components/connect-stage";
import { DoneStage } from "@/app/(auth)/onboarding/connect/_components/done-stage";
import {
  CreateAccountForm,
  type CreateAccountFormValues,
} from "@/app/(auth)/onboarding/signup/_components/create-account-form";
import { OtpVerificationStage } from "@/app/(auth)/onboarding/signup/_components/otp-verification-stage";
import type { SignupStep } from "@/app/(auth)/onboarding/signup/_components/signup-step.types";
import { SignupStepper } from "@/app/(auth)/onboarding/signup/_components/signup-stepper";
import { AUTH_METHODS } from "@/app/_libs/constants/auth-methods";
import { ROUTES } from "@/app/_libs/constants/routes";
import { MicrosoftLogo } from "@/assets/icons/microsoft-logo";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/auth/use-auth";
import { useGoogleConnection } from "@/hooks/connection/use-google-connection";
import { useOnboardingConnectFlow } from "@/hooks/onboarding/use-onboarding-connect-flow";

const SSO_LIKE_STEPS: SignupStep[] = ["identity", "connect"];
const PASSWORD_STEPS: SignupStep[] = ["identity", "otp", "connect"];

/**
 * Step 1 ("identity") verifies who's signing up — which method(s) render is
 * env-gated the same way as the login screen, via `AUTH_METHODS`. The
 * password path alone continues to a "verify email" OTP step before
 * reaching step 3: Microsoft/Google already assert a verified email as
 * part of their OAuth handshake, so those skip straight to step 3 exactly
 * as before. Step 3 reuses the same Google Business Profile connect flow
 * the standalone `/onboarding/connect` screen uses — connecting there
 * supplies a *location's* name/address, a separate thing from the
 * tenant/company name, which `CreateAccountForm` collects directly in
 * step 1 (a tenant can have several locations, so the company name can't
 * be derived from picking just one of them).
 */
export function OnboardingSignupView() {
  const t = useTranslations("onboardingSignup");
  const tLogin = useTranslations("auth.login");
  const tOtp = useTranslations("onboardingSignup.otp");
  const router = useRouter();
  const { signupWithMicrosoft, signupWithPassword, signupWithSocial, verifySignupOtp, resendSignupOtp, isLoading } =
    useAuth();
  const { connect } = useGoogleConnection();
  const connectFlow = useOnboardingConnectFlow();
  const [step, setStep] = React.useState<SignupStep>("identity");
  const [viaPassword, setViaPassword] = React.useState(false);
  const [signupEmail, setSignupEmail] = React.useState("");

  const bothSsoLike = AUTH_METHODS.sso && AUTH_METHODS.social;
  const stepperSteps = viaPassword ? PASSWORD_STEPS : SSO_LIKE_STEPS;

  const handleSsoSubmit = async () => {
    const succeeded = await signupWithMicrosoft();
    if (succeeded) setStep("connect");
  };

  const handlePasswordSubmit = async (values: CreateAccountFormValues) => {
    const succeeded = await signupWithPassword(values);
    if (succeeded) {
      setViaPassword(true);
      setSignupEmail(values.email);
      setStep("otp");
    }
  };

  const handleSocialSubmit = async () => {
    const succeeded = await signupWithSocial();
    if (succeeded) setStep("connect");
  };

  const handleVerifyOtp = async (code: string) => {
    const succeeded = await verifySignupOtp(code);
    if (succeeded) {
      setStep("connect");
    } else {
      toast.error(tOtp("toasts.verifyFailed"));
    }
  };

  const handleResendOtp = async () => {
    await resendSignupOtp();
    toast.success(tOtp("toasts.resent"));
  };

  const handleGoToDashboard = async () => {
    await connect();
    router.push(ROUTES.DASHBOARD);
  };

  return (
    <>
      <AuthLogo />

      <div className="flex w-full max-w-[460px] flex-col items-center gap-6">
        <SignupStepper
          steps={stepperSteps}
          currentStep={step}
          completedSteps={step === "connect" && connectFlow.stage === "done" ? ["connect"] : []}
        />

        <div className="animate-in fade-in slide-in-from-bottom-2 fill-mode-backwards p-fluid-page w-full rounded-xl border border-border bg-card shadow-elevated duration-500 ease-fluid">
          {step === "identity" ? (
            <>
              <p className="mb-6 text-center text-sm text-muted-foreground">{t("subtitle")}</p>

              {AUTH_METHODS.password ? (
                <CreateAccountForm isLoading={isLoading} onSubmit={(values) => void handlePasswordSubmit(values)} />
              ) : null}

              {AUTH_METHODS.password && (AUTH_METHODS.sso || AUTH_METHODS.social) ? (
                <AuthDivider label={tLogin("orDivider")} />
              ) : null}

              {bothSsoLike ? (
                <div className="grid grid-cols-2 gap-3">
                  <Button type="button" variant="outline" size="block" onClick={() => void handleSsoSubmit()}>
                    <MicrosoftLogo />
                    {tLogin("microsoft")}
                  </Button>
                  <SocialAuthButtons
                    isLoading={isLoading}
                    onGoogleClick={() => void handleSocialSubmit()}
                    label={tLogin("google")}
                  />
                </div>
              ) : (
                <>
                  {AUTH_METHODS.sso ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="block"
                      disabled={isLoading}
                      onClick={() => void handleSsoSubmit()}
                    >
                      <MicrosoftLogo />
                      {tLogin("continueWithMicrosoft")}
                    </Button>
                  ) : null}

                  {AUTH_METHODS.social ? (
                    <SocialAuthButtons
                      isLoading={isLoading}
                      onGoogleClick={() => void handleSocialSubmit()}
                      label={tLogin("continueWithGoogle")}
                    />
                  ) : null}
                </>
              )}
            </>
          ) : null}

          {step === "otp" ? (
            <OtpVerificationStage
              email={signupEmail}
              isLoading={isLoading}
              onVerify={(code) => void handleVerifyOtp(code)}
              onResend={() => void handleResendOtp()}
            />
          ) : null}

          {step === "connect" ? (
            <>
              {connectFlow.stage === "connect" ? <ConnectStage onConnect={connectFlow.startConnect} /> : null}
              {connectFlow.stage === "confirm_location" ? (
                <ConfirmLocationStage location={connectFlow.location} onContinue={connectFlow.confirmLocation} />
              ) : null}
              {connectFlow.stage === "backfilling" ? (
                <BackfillingStage
                  progress={connectFlow.progress}
                  importedCount={connectFlow.importedCount}
                  totalToImport={connectFlow.totalToImport}
                />
              ) : null}
              {connectFlow.stage === "done" ? (
                <DoneStage totalImported={connectFlow.totalToImport} onGoToDashboard={handleGoToDashboard} />
              ) : null}
            </>
          ) : null}
        </div>
      </div>
    </>
  );
}
