import { useRouter } from "next/navigation";

import { useCallback, useMemo } from "react";

import type { OnboardingStep } from "@/app/(auth)/onboarding/_components/onboarding-step.types";
import { ROUTES } from "@/app/_libs/constants/routes";
import { OnboardingContextService } from "@/app/_libs/services/onboarding-context.service";
import { usePlatformSettings } from "@/hooks/common/use-platform-settings";
import type { PlatformSettings } from "@/types/domain";

/**
 * The plan step only exists when billing does: with the platform's payment feature off there is nothing to choose, since every
 * signup is on Free. Unknown (settings not loaded yet) counts as "not skipped", so a deploy with payments on never loses the step
 * while the settings load; the settings are public and cached from the sign-in screens, so in practice they are already there.
 */
export function isPlanStepSkipped(settings: PlatformSettings | undefined): boolean {
  return settings !== undefined && settings.paymentFeatureEnabled !== true;
}

/** The steps the signup wizard shows, in order: `identity` and `otp` (password only) on signup, then `plan` (payments on only), then `connect`. */
export function useOnboardingSteps(viaPassword: boolean): OnboardingStep[] {
  const { data: platformSettings } = usePlatformSettings();
  const skipPlan = isPlanStepSkipped(platformSettings);

  return useMemo(() => {
    const steps: OnboardingStep[] = viaPassword
      ? ["identity", "otp", "plan", "connect"]
      : ["identity", "plan", "connect"];
    return skipPlan ? steps.filter((step) => step !== "plan") : steps;
  }, [viaPassword, skipPlan]);
}

/**
 * Where a fresh signup goes once it has an account: the plan step, or straight to connect when payments are off. In that case Free is
 * recorded here, which is what the connect screen's gate looks for, so nobody lands on the plan page just to be bounced off it
 * (the plan page keeps that bounce as a safety net for a signup that finished before the settings had loaded). `replace`, not `push`:
 * Back must not return an authenticated user to a route that sends them on again.
 */
export function useHandOffAfterSignup(): (via: "password" | "sso") => void {
  const router = useRouter();
  const { data: platformSettings } = usePlatformSettings();
  const skipPlan = isPlanStepSkipped(platformSettings);

  return useCallback(
    (via) => {
      OnboardingContextService.set({ from: "signup", via, ...(skipPlan ? { plan: "free" as const } : {}) });
      router.replace(skipPlan ? ROUTES.ONBOARDING_CONNECT : ROUTES.ONBOARDING_PLAN);
    },
    [router, skipPlan],
  );
}
