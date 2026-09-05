import type { Metadata } from "next";

import { ReviewDetailView } from "@/app/(dashboard)/review-queue/[reviewId]/_components/review-detail-view";

export const metadata: Metadata = {
  title: "Review Detail — InnoPeak",
};

interface ReviewDetailPageProps {
  params: Promise<{ reviewId: string }>;
}

export default async function ReviewDetailPage({ params }: ReviewDetailPageProps) {
  const { reviewId } = await params;
  return <ReviewDetailView reviewId={reviewId} />;
}
