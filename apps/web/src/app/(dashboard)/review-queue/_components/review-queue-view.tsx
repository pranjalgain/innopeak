"use client";

import { useTranslations } from "next-intl";

import { ReviewFiltersBar } from "@/app/(dashboard)/review-queue/_components/review-filters-bar";
import { ReviewResults } from "@/app/(dashboard)/review-queue/_components/review-results";
import { Pagination } from "@/components/common/pagination";
import { Skeleton } from "@/components/ui/skeleton";
import { useReviewQueue } from "@/hooks/reviews/use-review-queue";

function ReviewQueueSkeleton() {
  return (
    <>
      <div className="hidden flex-col gap-2 overflow-hidden rounded-xl border border-border md:flex">
        <Skeleton className="h-10 w-full rounded-none" />
        <div className="flex flex-col gap-3 p-3">
          <Skeleton className="h-11 w-full" />
          <Skeleton className="h-11 w-full" />
          <Skeleton className="h-11 w-full" />
          <Skeleton className="h-11 w-full" />
        </div>
      </div>
      <div className="flex flex-col gap-3 md:hidden">
        <Skeleton className="h-[140px] w-full rounded-xl" />
        <Skeleton className="h-[140px] w-full rounded-xl" />
        <Skeleton className="h-[140px] w-full rounded-xl" />
      </div>
    </>
  );
}

export function ReviewQueueView() {
  const t = useTranslations("reviewQueue");
  const {
    reviews,
    filters,
    setStatus,
    setClassification,
    setSearch,
    isLoading,
    isError,
    retry,
    total,
    page,
    totalPages,
    goToPreviousPage,
    goToNextPage,
  } = useReviewQueue();

  const handleClearFilters = () => {
    setStatus("all");
    setClassification("all");
    setSearch("");
  };

  return (
    <div className="flex min-h-full flex-col gap-6 p-fluid-page">
      {/* `total` — the backend's full count for the current filters, not `reviews.length` (this
          page's row count) — or every page past the first would understate how many results exist. */}
      <p className="text-sm text-muted-foreground">{t("resultCount", { count: total })}</p>

      <ReviewFiltersBar
        filters={filters}
        onStatusChange={setStatus}
        onClassificationChange={setClassification}
        onSearchChange={setSearch}
      />

      {isLoading ? (
        <ReviewQueueSkeleton />
      ) : (
        <>
          <ReviewResults
            reviews={reviews}
            isError={isError}
            onRetry={retry}
            onClearFilters={handleClearFilters}
          />
          <div className="mt-auto">
            <Pagination page={page} totalPages={totalPages} onPrevious={goToPreviousPage} onNext={goToNextPage} />
          </div>
        </>
      )}
    </div>
  );
}
