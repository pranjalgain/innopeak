import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { OnboardingPlanView } from "@/app/(auth)/onboarding/plan/_components/onboarding-plan-view";
import { RequireAuth } from "@/app/_components/require-auth";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("pageTitles");
  return { title: t("plan") };
}

export default function OnboardingPlanPage() {
  return (
    <RequireAuth>
      <OnboardingPlanView />
    </RequireAuth>
  );
}
