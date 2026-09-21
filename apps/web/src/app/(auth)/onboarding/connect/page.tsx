import type { Metadata } from "next";

import { OnboardingConnectView } from "@/app/(auth)/onboarding/connect/_components/onboarding-connect-view";
import { RequireAuth } from "@/app/_components/require-auth";

export const metadata: Metadata = {
  title: "Connect Google Business Profile",
};

export default function OnboardingConnectPage() {
  return (
    <RequireAuth>
      <OnboardingConnectView />
    </RequireAuth>
  );
}
