import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { OnboardingConnectView } from "@/app/(auth)/onboarding/connect/_components/onboarding-connect-view";
import { RequireAuth } from "@/app/_components/require-auth";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("pageTitles");
  return { title: t("connect") };
}

export default function OnboardingConnectPage() {
  return (
    <RequireAuth>
      <OnboardingConnectView />
    </RequireAuth>
  );
}
