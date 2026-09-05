import type { Metadata } from "next";

import { OnboardingConnectView } from "@/app/(auth)/onboarding/connect/_components/onboarding-connect-view";

export const metadata: Metadata = {
  title: "Connect Google Business Profile — InnoPeak",
};

export default function OnboardingConnectPage() {
  return <OnboardingConnectView />;
}
