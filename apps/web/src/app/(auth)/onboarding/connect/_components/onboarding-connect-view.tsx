"use client";

import { AnimatePresence, motion } from "motion/react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";


import { AuthLogo } from "@/app/(auth)/_components/auth-logo";
import type { OnboardingStep } from "@/app/(auth)/onboarding/_components/onboarding-step.types";
import { OnboardingStepper } from "@/app/(auth)/onboarding/_components/onboarding-stepper";
import { AccountPickerStage } from "@/app/(auth)/onboarding/connect/_components/account-picker-stage";
import { BackfillingStage } from "@/app/(auth)/onboarding/connect/_components/backfilling-stage";
import { ConfirmLocationStage } from "@/app/(auth)/onboarding/connect/_components/confirm-location-stage";
import { ConnectErrorStage } from "@/app/(auth)/onboarding/connect/_components/connect-error-stage";
import { ConnectSkeleton } from "@/app/(auth)/onboarding/connect/_components/connect-skeleton";
import { ConnectStage } from "@/app/(auth)/onboarding/connect/_components/connect-stage";
import { DoneStage } from "@/app/(auth)/onboarding/connect/_components/done-stage";
import { ROUTES } from "@/app/_libs/constants/routes";
import {
  type OnboardingContext,
  OnboardingContextService,
} from "@/app/_libs/services/onboarding-context.service";
import { Button } from "@/components/ui/button";
import { useOnboardingConnectFlow } from "@/hooks/onboarding/use-onboarding-connect-flow";

const PASSWORD_STEPS: OnboardingStep[] = ["identity", "otp", "plan", "connect"];
const SSO_LIKE_STEPS: OnboardingStep[] = ["identity", "plan", "connect"];

/**
 * Final signup step and the standalone reconnect screen: the OAuth round trip can't happen on /onboarding/signup because
 * `proxy.ts` REDIRECT_IF_AUTHENTICATED_PATHS bounces authenticated users to /dashboard. The stepper only shows mid-wizard.
 *
 * A fresh signup that has not picked a plan is sent back to choose one; with no wizard context (a returning owner reconnecting
 * from Settings) there is nothing to gate. The connect flow mounts only once the gate opens, so a bounced visit never starts it
 * (its resume calls the API and handles the OAuth callback's query params).
 */
export function OnboardingConnectView() {
  const router = useRouter();
  const [gate, setGate] = useState<{ context: OnboardingContext | null } | null>(null);

  // Read in an effect: sessionStorage doesn't exist on the server, and reading it inline would mismatch the server HTML.
  useEffect(() => {
    const stored = OnboardingContextService.get();
    if (stored && !stored.plan) {
      router.replace(ROUTES.ONBOARDING_PLAN);
      return;
    }
    setGate({ context: stored });
  }, [router]);

  if (!gate) {
    return (
      <>
        <AuthLogo />
        <div className="p-fluid-page border-border bg-card shadow-elevated w-full max-w-[480px] rounded-xl border">
          <ConnectSkeleton />
        </div>
      </>
    );
  }

  return <OnboardingConnectFlow context={gate.context} />;
}

function OnboardingConnectFlow({ context }: { context: OnboardingContext | null }) {
  const router = useRouter();
  const t = useTranslations("onboardingConnect");
  const flow = useOnboardingConnectFlow();

  // Free can still be changed until locations are being imported; Paid cannot, since the plan screen would offer a second payment.
  const canChangePlan =
    context?.plan === "free" &&
    (flow.stage === "connect" ||
      flow.stage === "redirecting" ||
      flow.stage === "confirm_location");

  const handleChangePlan = () => {
    // Forgotten, so the connect screen stays closed until a plan is chosen again.
    OnboardingContextService.clearPlan();
    router.push(ROUTES.ONBOARDING_PLAN);
  };

  const handleGoToDashboard = () => {
    // The wizard is over; leaving this would redraw the stepper on a later reconnect visit from Settings.
    OnboardingContextService.clear();
    router.push(ROUTES.DASHBOARD);
  };

  // Stages rendering the same component share one animation key so sub-state changes don't replay the transition.
  const stageGroup =
    flow.stage === "connect" || flow.stage === "redirecting"
      ? "connect"
      : flow.stage === "choose_account" || flow.stage === "submitting_account"
        ? "choose_account"
        : flow.stage === "confirm_location" || flow.stage === "submitting_location"
          ? "confirm_location"
          : flow.stage;

  return (
    <>
      <AuthLogo />

      <div className="flex w-full max-w-[480px] flex-col items-center gap-6">
        {context ? (
          <OnboardingStepper
            steps={context.via === "password" ? PASSWORD_STEPS : SSO_LIKE_STEPS}
            currentStep="connect"
            completedSteps={flow.stage === "done" ? ["connect"] : []}
          />
        ) : null}

        <div className="animate-in fade-in slide-in-from-bottom-2 fill-mode-backwards p-fluid-page border-border bg-card shadow-elevated ease-fluid w-full overflow-hidden rounded-xl border duration-500">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={stageGroup}
              initial={{ opacity: 0, x: 24 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -24 }}
              transition={{ duration: 0.25, ease: "easeOut" }}
            >
              {flow.stage === "checking" ? <ConnectSkeleton /> : null}

              {flow.stage === "connect" || flow.stage === "redirecting" ? (
                <ConnectStage
                  onConnect={flow.startConnect}
                  isLoading={flow.stage === "redirecting"}
                />
              ) : null}

              {flow.stage === "loading_locations" ? <ConnectSkeleton /> : null}

              {flow.stage === "choose_account" || flow.stage === "submitting_account" ? (
                <AccountPickerStage
                  accounts={flow.accounts}
                  selectedAccountId={flow.selectedAccountId}
                  onSelect={flow.selectAccount}
                  onContinue={flow.confirmAccount}
                  isSubmitting={flow.stage === "submitting_account"}
                />
              ) : null}

              {flow.stage === "confirm_location" || flow.stage === "submitting_location" ? (
                <ConfirmLocationStage
                  locations={flow.locations}
                  selectedLocationIds={flow.selectedLocationIds}
                  isSingleSelect={flow.isSingleSelect}
                  onToggle={flow.toggleLocation}
                  onContinue={flow.confirmLocation}
                  isSubmitting={flow.stage === "submitting_location"}
                />
              ) : null}

              {flow.stage === "backfilling" ? (
                <BackfillingStage
                  progress={flow.progress}
                  reviewsFetched={flow.reviewsFetched}
                  totalToImport={flow.totalToImport}
                  isSlow={flow.isSlow}
                />
              ) : null}

              {/* Imported count, not the planned total: the backfill stops early once it has enough historical replies for few-shot examples. */}
              {flow.stage === "done" ? (
                <DoneStage
                  totalImported={flow.reviewsFetched}
                  onGoToDashboard={handleGoToDashboard}
                />
              ) : null}

              {flow.stage === "error" && flow.error ? (
                <ConnectErrorStage error={flow.error} onRetry={flow.retry} />
              ) : null}
            </motion.div>
          </AnimatePresence>
          {canChangePlan ? (
            <div className="mt-4 text-center">
              <Button
                type="button"
                variant="link"
                size="sm"
                disabled={flow.stage === "redirecting"}
                onClick={handleChangePlan}>
                {t("changePlan")}
              </Button>
            </div>
          ) : null}
        </div>
      </div>
    </>
  );
}
