import { useTranslations } from "next-intl";
import { Fragment } from "react";
import { LuCheck } from "react-icons/lu";

import type { SignupStep } from "@/app/(auth)/onboarding/signup/_components/signup-step.types";
import { cn } from "@/app/_libs/utils/cn";

interface SignupStepperProps {
  /** Which steps are actually part of this run — SSO/social skip "otp" entirely, password doesn't. */
  steps: SignupStep[];
  currentStep: SignupStep;
  /**
   * Steps to render as complete (checkmark) even though they're still the
   * current step — e.g. the final "connect" step once its own sub-flow has
   * reached its "you're all set" screen. Without this, the last step in the
   * stepper can never show a checkmark, since there's no later step for
   * `index < currentIndex` to compare against.
   */
  completedSteps?: SignupStep[];
}

/**
 * No design source covers this — designed fresh against the app's existing
 * visual language (primary for active/complete, muted for upcoming, the
 * same checkmark treatment `DoneStage`'s success circle already uses).
 *
 * Each step's own content is `shrink-0` (sized to its own label, never
 * stretched or squeezed) and the connecting line is a `flex-1` sibling of
 * the `<ol>` itself, not nested inside either step — so it always fills
 * exactly the leftover width regardless of which step's label happens to
 * be longer ("Connect business profile" vs. "Create account"), instead of
 * visually shrinking when the step after it claims more space than the
 * step before it.
 */
export function SignupStepper({ steps, currentStep, completedSteps = [] }: SignupStepperProps) {
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
