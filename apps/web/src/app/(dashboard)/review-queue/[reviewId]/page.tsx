import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { ReviewDetailView } from "@/app/(dashboard)/review-queue/[reviewId]/_components/review-detail-view";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("pageTitles");
  return { title: t("reviewDetail") };
}

interface ReviewDetailPageProps {
  params: Promise<{ reviewId: string }>;
}

export default async function ReviewDetailPage({ params }: ReviewDetailPageProps) {
  const { reviewId } = await params;
  return <ReviewDetailView reviewId={reviewId} />;
}
