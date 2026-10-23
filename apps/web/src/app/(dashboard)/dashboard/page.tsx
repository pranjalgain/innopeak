import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { DashboardView } from "@/app/(dashboard)/dashboard/_components/dashboard-view";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("pageTitles");
  return { title: t("dashboard") };
}

export default function DashboardPage() {
  return <DashboardView />;
}
