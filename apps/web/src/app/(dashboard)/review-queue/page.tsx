import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { ReviewQueueView } from "@/app/(dashboard)/review-queue/_components/review-queue-view";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("pageTitles");
  return { title: t("reviewQueue") };
}

export default function ReviewQueuePage() {
  return <ReviewQueueView />;
}
