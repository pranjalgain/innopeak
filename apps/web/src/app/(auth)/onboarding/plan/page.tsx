import type { Metadata } from "next";

import { OnboardingPlanView } from "@/app/(auth)/onboarding/plan/_components/onboarding-plan-view";
import { RequireAuth } from "@/app/_components/require-auth";

export const metadata: Metadata = {
  title: "Choose your plan",
};

export default function OnboardingPlanPage() {
  return (
    <RequireAuth>
      <OnboardingPlanView />
    </RequireAuth>
  );
}
