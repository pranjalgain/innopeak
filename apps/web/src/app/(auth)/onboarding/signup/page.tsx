import type { Metadata } from "next";

import { OnboardingSignupView } from "@/app/(auth)/onboarding/signup/_components/onboarding-signup-view";
import { RedirectIfAuthenticated } from "@/app/_components/redirect-if-authenticated";

export const metadata: Metadata = {
  title: "Create your account",
};

export default function OnboardingSignupPage() {
  return (
    <RedirectIfAuthenticated>
      <OnboardingSignupView />
    </RedirectIfAuthenticated>
  );
}
