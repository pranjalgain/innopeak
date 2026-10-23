import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { LoginView } from "@/app/(auth)/login/_components/login-view";
import { RedirectIfAuthenticated } from "@/app/_components/redirect-if-authenticated";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("pageTitles");
  return { title: t("login") };
}

export default function LoginPage() {
  return (
    <RedirectIfAuthenticated>
      <LoginView />
    </RedirectIfAuthenticated>
  );
}
