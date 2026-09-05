import type { Metadata } from "next";

import { ReviewQueueView } from "@/app/(dashboard)/review-queue/_components/review-queue-view";

export const metadata: Metadata = {
  title: "Review Queue — InnoPeak",
};

export default function ReviewQueuePage() {
  return <ReviewQueueView />;
}
