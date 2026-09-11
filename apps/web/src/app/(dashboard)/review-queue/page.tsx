import type { Metadata } from "next";

import { ReviewQueueView } from "@/app/(dashboard)/review-queue/_components/review-queue-view";

export const metadata: Metadata = {
  title: "Review Queue",
};

export default function ReviewQueuePage() {
  return <ReviewQueueView />;
}
