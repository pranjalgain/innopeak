import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { AdminSettingsView } from "@/app/admin/settings/_components/admin-settings-view";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("pageTitles");
  // `absolute` bypasses the root layout's title template (`%s - InnoPeak`) — see admin/page.tsx.
  return { title: { absolute: t("adminSettings") } };
}

export default function AdminSettingsPage() {
  return <AdminSettingsView />;
}
