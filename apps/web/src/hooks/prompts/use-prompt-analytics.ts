import { useQuery } from "@tanstack/react-query";
import { useCallback } from "react";


import { ReviewService } from "@/app/_libs/services/review.service";
import { computePromptVersionStats } from "@/app/_libs/utils/prompt-analytics";
import type { PromptVersionStats } from "@/types/domain";

export const promptAnalyticsReviewsQueryKey = ["reviews", "for-prompt-analytics"] as const;

interface UsePromptAnalyticsResult {
  isLoading: boolean;
  getStats: (promptId: string, version?: number) => PromptVersionStats;
}

/**
 * Loads every review once (reply drafts live on `Review`, not `AiPrompt`)
 * and exposes a pure lookup so callers can pull stats for any prompt/version
 * without re-fetching. Kept separate from `usePrompts` since it needs a
 * different data source — prompts and reviews are independent mock services.
 */
export function usePromptAnalytics(): UsePromptAnalyticsResult {
  // A large page rather than "everything": analytics is computed across whatever reply drafts
  // exist, and the alternative — paginating the entire review history into the browser to
  // average two numbers — is worse than a bounded sample. Real aggregation belongs on the
  // server once the prompts module has an analytics endpoint.
  //
  // No error handling here, deliberately: analytics is supplementary, and a failed fetch should
  // show empty stats rather than break the prompts screen it decorates — the default `[]` below
  // already covers that, with no toast needed.
  const reviewsQuery = useQuery({
    queryKey: promptAnalyticsReviewsQueryKey,
    queryFn: () => ReviewService.getReviews({ pageSize: 100 }),
  });

  const getStats = useCallback(
    (promptId: string, version?: number) =>
      computePromptVersionStats(reviewsQuery.data?.reviews ?? [], promptId, version),
    [reviewsQuery.data],
  );

  return { isLoading: reviewsQuery.isLoading, getStats };
}
