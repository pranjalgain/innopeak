import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { AdminBillingView } from "@/app/admin/billing/_components/admin-billing-view";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("pageTitles");
  // `absolute` bypasses the root layout's title template — see admin/page.tsx.
  return { title: { absolute: t("adminBilling") } };
}

export default function AdminBillingPage() {
  return <AdminBillingView />;
}
