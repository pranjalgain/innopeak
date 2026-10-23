import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { AdminBusinessesView } from "@/app/admin/businesses/_components/admin-businesses-view";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("pageTitles");
  // `absolute` bypasses the root layout's title template (`%s - InnoPeak`) — see admin/page.tsx.
  return { title: { absolute: t("adminBusinesses") } };
}

export default function AdminBusinessesPage() {
  return <AdminBusinessesView />;
}
