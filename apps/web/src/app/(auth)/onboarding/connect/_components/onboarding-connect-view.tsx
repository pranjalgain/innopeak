"use client";

import { AnimatePresence, motion } from "motion/react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";


import { AuthLogo } from "@/app/(auth)/_components/auth-logo";
import type { OnboardingStep } from "@/app/(auth)/onboarding/_components/onboarding-step.types";
import { OnboardingStepper } from "@/app/(auth)/onboarding/_components/onboarding-stepper";
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
import { useOnboardingConnectFlow } from "@/hooks/onboarding/use-onboarding-connect-flow";

const PASSWORD_STEPS: OnboardingStep[] = ["identity", "otp", "connect"];
const SSO_LIKE_STEPS: OnboardingStep[] = ["identity", "connect"];

/**
 * Step 3 of signup *and* the standalone reconnect screen — the same route serves both, because the
 * OAuth round trip cannot survive staying on /onboarding/signup: that path is in `proxy.ts`'s
 * REDIRECT_IF_AUTHENTICATED_PATHS, and by this point the user is authenticated, so any full
 * navigation there bounces to /dashboard. It only appeared to work before because the mocked flow
 * never navigated anywhere.
 *
 * When the user arrived mid-wizard, the 3-step stepper is still drawn so progress reads as
 * continuous rather than as a wizard that restarted.
 */
export function OnboardingConnectView() {
  const router = useRouter();
  const flow = useOnboardingConnectFlow();
  const [context, setContext] = useState<OnboardingContext | null>(null);

  // Read in an effect, not during render: sessionStorage does not exist on the server, and
  // reading it inline would make the first client render disagree with the server's HTML.
  useEffect(() => {
    setContext(OnboardingContextService.get());
  }, []);

  const handleGoToDashboard = () => {
    // The wizard is over — leaving this behind would redraw the stepper for someone who later
    // revisits this screen from Settings to reconnect.
    OnboardingContextService.clear();
    router.push(ROUTES.DASHBOARD);
  };

  // Groups stages that render the same component under one animation key, so a sub-state change
  // (e.g. "connect" -> "redirecting", both ConnectStage) doesn't replay the enter/exit transition.
  const stageGroup =
    flow.stage === "connect" || flow.stage === "redirecting"
      ? "connect"
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

              {flow.stage === "confirm_location" || flow.stage === "submitting_location" ? (
                <ConfirmLocationStage
                  locations={flow.locations}
                  selectedLocationIds={flow.selectedLocationIds}
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

              {/* The actual imported count, not the planned total — with a real backend the two
                  genuinely differ, and the backfill deliberately stops early once it has enough
                  historical replies for the AI's few-shot examples. */}
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
        </div>
      </div>
    </>
  );
}
