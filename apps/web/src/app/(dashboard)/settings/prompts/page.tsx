import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { PromptManagementView } from "@/app/(dashboard)/settings/prompts/_components/prompt-management-view";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("pageTitles");
  return { title: t("prompts") };
}

export default function PromptManagementPage() {
  return <PromptManagementView />;
}
