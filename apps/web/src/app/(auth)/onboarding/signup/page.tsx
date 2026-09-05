import type { Metadata } from "next";

import { OnboardingSignupView } from "@/app/(auth)/onboarding/signup/_components/onboarding-signup-view";

export const metadata: Metadata = {
  title: "Create your account — InnoPeak",
};

export default function OnboardingSignupPage() {
  return <OnboardingSignupView />;
}
