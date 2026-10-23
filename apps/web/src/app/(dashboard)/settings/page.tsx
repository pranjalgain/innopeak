import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { SettingsView } from "@/app/(dashboard)/settings/_components/settings-view";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("pageTitles");
  return { title: t("settings") };
}

export default function SettingsPage() {
  return <SettingsView />;
}
