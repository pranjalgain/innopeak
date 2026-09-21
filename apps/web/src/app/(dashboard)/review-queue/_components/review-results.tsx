import { ReviewCardList } from "@/app/(dashboard)/review-queue/_components/review-card-list";
import { ReviewEmptyState } from "@/app/(dashboard)/review-queue/_components/review-empty-state";
import { ReviewErrorState } from "@/app/(dashboard)/review-queue/_components/review-error-state";
import { ReviewTable } from "@/app/(dashboard)/review-queue/_components/review-table";
import type { Review } from "@/types/domain";

interface ReviewResultsProps {
  reviews: Review[];
  isError: boolean;
  onRetry: () => void;
  onClearFilters: () => void;
}

/**
 * Renders both layouts and toggles them with responsive visibility classes
 * (rather than a JS breakpoint check) so there's no hydration mismatch and
 * no layout shift once the client mounts.
 */
export function ReviewResults({ reviews, isError, onRetry, onClearFilters }: ReviewResultsProps) {
  // Checked before the empty state: a failed fetch also leaves `reviews` at `[]` (`keepPreviousData`
  // only holds the prior page while the new one is still pending, not once it settles as an error),
  // and "no reviews match these filters" is the wrong message for a request that never landed.
  if (isError) return <ReviewErrorState onRetry={onRetry} />;
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
