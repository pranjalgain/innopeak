import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { AdminActivityView } from "@/app/admin/activity/_components/admin-activity-view";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("pageTitles");
  // `absolute` bypasses the root layout's title template — see admin/page.tsx.
  return { title: { absolute: t("adminActivity") } };
}

export default function AdminActivityPage() {
  return <AdminActivityView />;
}
