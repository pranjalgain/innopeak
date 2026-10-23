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
 * Renders both layouts and toggles them with responsive classes (not a JS breakpoint check) to avoid a
 * hydration mismatch and layout shift. The table needs ~820px: the content area is narrower than that up to `xl` (the sidebar takes a
 * rail or a column), so tablets and small laptops get cards rather than a table that scrolls sideways.
 */
export function ReviewResults({ reviews, isError, onRetry, onClearFilters }: ReviewResultsProps) {
  // Checked before the empty state: a failed fetch also leaves `reviews` at `[]` (`keepPreviousData` only holds the
  // prior page while pending), and "no reviews match" is the wrong message for a request that never landed.
  if (isError) return <ReviewErrorState onRetry={onRetry} />;
  if (reviews.length === 0) return <ReviewEmptyState onClearFilters={onClearFilters} />;

  return (
    <>
      <div className="hidden xl:block">
        <ReviewTable reviews={reviews} />
      </div>
      <div className="xl:hidden">
        <ReviewCardList reviews={reviews} />
      </div>
    </>
  );
}
