import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { AdminUsersView } from "@/app/admin/users/_components/admin-users-view";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("pageTitles");
  // `absolute` bypasses the root layout's title template (`%s - InnoPeak`) — see admin/page.tsx.
  return { title: { absolute: t("adminUsers") } };
}

export default function AdminUsersPage() {
  return <AdminUsersView />;
}
