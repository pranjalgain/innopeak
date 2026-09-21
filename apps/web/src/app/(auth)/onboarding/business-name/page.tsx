import type { Metadata } from "next";

import { BusinessNameView } from "@/app/(auth)/onboarding/business-name/_components/business-name-view";
import { RedirectIfAuthenticated } from "@/app/_components/redirect-if-authenticated";

export const metadata: Metadata = {
  title: "Your business name",
};

export default function OnboardingBusinessNamePage() {
  return (
    <RedirectIfAuthenticated>
      <BusinessNameView />
    </RedirectIfAuthenticated>
  );
}
