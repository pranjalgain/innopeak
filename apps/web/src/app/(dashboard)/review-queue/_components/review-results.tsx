import { ReviewCardList } from "@/app/(dashboard)/review-queue/_components/review-card-list";
import { ReviewEmptyState } from "@/app/(dashboard)/review-queue/_components/review-empty-state";
import { ReviewTable } from "@/app/(dashboard)/review-queue/_components/review-table";
import type { Review } from "@/types/domain";

interface ReviewResultsProps {
  reviews: Review[];
  onClearFilters: () => void;
}

/**
 * Renders both layouts and toggles them with responsive visibility classes
 * (rather than a JS breakpoint check) so there's no hydration mismatch and
 * no layout shift once the client mounts.
 */
export function ReviewResults({ reviews, onClearFilters }: ReviewResultsProps) {
  if (reviews.length === 0) return <ReviewEmptyState onClearFilters={onClearFilters} />;

  return (
    <>
      <div className="hidden md:block">
        <ReviewTable reviews={reviews} />
      </div>
      <div className="md:hidden">
        <ReviewCardList reviews={reviews} />
      </div>
    </>
  );
}
