import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { AdminDashboardView } from "@/app/admin/_components/admin-dashboard-view";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("pageTitles");
  // `absolute` bypasses the root layout's title template (`%s - InnoPeak`) entirely — admin
  // screens brand themselves "InnoPeak Admin", a different suffix than the rest of the app.
  return { title: { absolute: t("adminOverview") } };
}

export default function AdminOverviewPage() {
  return <AdminDashboardView />;
}
