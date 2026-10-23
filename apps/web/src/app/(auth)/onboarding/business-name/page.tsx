import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { BusinessNameView } from "@/app/(auth)/onboarding/business-name/_components/business-name-view";
import { RedirectIfAuthenticated } from "@/app/_components/redirect-if-authenticated";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("pageTitles");
  return { title: t("businessName") };
}

export default function OnboardingBusinessNamePage() {
  return (
    <RedirectIfAuthenticated>
      <BusinessNameView />
    </RedirectIfAuthenticated>
  );
}
