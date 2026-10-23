import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { AdminLoginView } from "@/app/(auth)/admin-login/_components/admin-login-view";
import { RedirectIfAuthenticated } from "@/app/_components/redirect-if-authenticated";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("pageTitles");
  return { title: t("adminLogin") };
}

export default function AdminLoginPage() {
  return (
    <RedirectIfAuthenticated>
      <AdminLoginView />
    </RedirectIfAuthenticated>
  );
}
