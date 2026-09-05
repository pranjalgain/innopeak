import { useTranslations } from "next-intl";
import * as React from "react";
import { toast } from "sonner";

import { ReviewService } from "@/app/_libs/services/review.service";
import type { Review, ReviewQueueFilters } from "@/types/domain";

interface UseReviewQueueResult {
  reviews: Review[];
  filteredReviews: Review[];
  filters: ReviewQueueFilters;
  setStatus: (status: ReviewQueueFilters["status"]) => void;
  setClassification: (classification: ReviewQueueFilters["classification"]) => void;
  setSearch: (search: string) => void;
  isLoading: boolean;
}

const INITIAL_FILTERS: ReviewQueueFilters = {
  status: "all",
  classification: "all",
  search: "",
};

/**
 * Loads every review once and filters client-side. Fine at this data
 * volume — move filtering server-side (status/classification/search as
 * query params) once the real backend and page size make that necessary.
 * A load failure surfaces via toast.
 */
export function useReviewQueue(): UseReviewQueueResult {
  const t = useTranslations("reviewQueue.toasts");
  const [reviews, setReviews] = React.useState<Review[]>([]);
  const [filters, setFilters] = React.useState<ReviewQueueFilters>(INITIAL_FILTERS);
  const [isLoading, setIsLoading] = React.useState(true);

  React.useEffect(() => {
    let cancelled = false;

    setIsLoading(true);
    ReviewService.getReviews()
      .then((result) => {
        if (!cancelled) setReviews(result);
      })
      .catch(() => {
        if (!cancelled) toast.error(t("loadFailed"));
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [t]);

  const filteredReviews = React.useMemo(() => {
    const search = filters.search.trim().toLowerCase();
    return reviews.filter((review) => {
      const statusOk = filters.status === "all" || review.status === filters.status;
      const classificationOk =
        filters.classification === "all" || review.classification === filters.classification;
      const searchOk = search === "" || review.reviewerName.toLowerCase().includes(search);
      return statusOk && classificationOk && searchOk;
    });
  }, [reviews, filters]);

  return {
    reviews,
    filteredReviews,
    filters,
    setStatus: (status) => setFilters((prev) => ({ ...prev, status })),
    setClassification: (classification) => setFilters((prev) => ({ ...prev, classification })),
    setSearch: (search) => setFilters((prev) => ({ ...prev, search })),
    isLoading,
  };
}
