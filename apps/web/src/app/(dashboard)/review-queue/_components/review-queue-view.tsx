"use client";

import { useTranslations } from "next-intl";
import * as React from "react";

import { ReviewFiltersBar } from "@/app/(dashboard)/review-queue/_components/review-filters-bar";
import { ReviewResults } from "@/app/(dashboard)/review-queue/_components/review-results";
import { Pagination } from "@/components/common/pagination";
import { Skeleton } from "@/components/ui/skeleton";
import { usePagination } from "@/hooks/common/use-pagination";
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
  const { filteredReviews, filters, setStatus, setClassification, setSearch, isLoading } = useReviewQueue();
  const { page, totalPages, pageItems, setPage, goToPreviousPage, goToNextPage } = usePagination(filteredReviews, 10);

  React.useEffect(() => {
    setPage(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters]);

  const handleClearFilters = () => {
    setStatus("all");
    setClassification("all");
    setSearch("");
  };

  return (
    <div className="flex min-h-full flex-col gap-6 p-fluid-page">
      <p className="text-sm text-muted-foreground">{t("resultCount", { count: filteredReviews.length })}</p>

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
          <ReviewResults reviews={pageItems} onClearFilters={handleClearFilters} />
          <div className="mt-auto">
            <Pagination page={page} totalPages={totalPages} onPrevious={goToPreviousPage} onNext={goToNextPage} />
          </div>
        </>
      )}
    </div>
  );
}
