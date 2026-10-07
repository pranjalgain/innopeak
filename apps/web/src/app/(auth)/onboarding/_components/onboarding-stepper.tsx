import { useTranslations } from "next-intl";
import { Fragment } from "react";
import { LuCheck } from "react-icons/lu";

import type { OnboardingStep } from "@/app/(auth)/onboarding/_components/onboarding-step.types";
import { cn } from "@/app/_libs/utils/cn";

interface OnboardingStepperProps {
  /** Which steps are actually part of this run — SSO/social skip "otp" entirely, password doesn't. */
  steps: OnboardingStep[];
  currentStep: OnboardingStep;
  /** Steps drawn complete though still current (e.g. "connect" once done); the last step has no later step for `index < currentIndex` to compare against. */
  completedSteps?: OnboardingStep[];
}

/**
 * Lives in `onboarding/_components/` because the flow spans sibling routes. Each step is `shrink-0` and the connector a
 * `flex-1` sibling of the `<ol>`, so the line fills the leftover width whichever label is longer.
 */
export function OnboardingStepper({ steps, currentStep, completedSteps = [] }: OnboardingStepperProps) {
  const t = useTranslations("onboardingSignup.stepper");
  const currentIndex = steps.indexOf(currentStep);

  return (
    <ol className="flex w-full max-w-[360px] items-center">
      {steps.map((step, index) => {
        const isComplete = index < currentIndex || completedSteps.includes(step);
        const isActive = index === currentIndex && !isComplete;

        return (
          <Fragment key={step}>
            <li className="flex shrink-0 flex-col items-center gap-1">
              <div
                className={cn(
                  "flex size-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold",
                  isComplete && "bg-primary/80 text-primary-foreground",
                  isActive && "border-2 border-primary text-primary",
                  !isComplete && !isActive && "border border-border text-muted-foreground",
                )}
              >
                {isComplete ? <LuCheck className="size-3" /> : index + 1}
              </div>
              <span
                className={cn(
                  "text-[10.5px] font-medium whitespace-nowrap",
                  isActive ? "text-foreground" : "text-muted-foreground",
                )}
              >
                {t(step)}
              </span>
            </li>

            {index < steps.length - 1 ? (
              <div className={cn("mx-2 h-px flex-1", isComplete ? "bg-primary/60" : "bg-border")} />
            ) : null}
          </Fragment>
        );
      })}
    </ol>
  );
}
