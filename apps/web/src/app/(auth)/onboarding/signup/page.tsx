import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { OnboardingSignupView } from "@/app/(auth)/onboarding/signup/_components/onboarding-signup-view";
import { RedirectIfAuthenticated } from "@/app/_components/redirect-if-authenticated";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("pageTitles");
  return { title: t("signup") };
}

export default function OnboardingSignupPage() {
  return (
    <RedirectIfAuthenticated>
      <OnboardingSignupView />
    </RedirectIfAuthenticated>
  );
}
