import { useCallback, useEffect, useState } from "react";

import { ReviewService } from "@/app/_libs/services/review.service";
import { computePromptVersionStats } from "@/app/_libs/utils/prompt-analytics";
import type { PromptVersionStats, Review } from "@/types/domain";

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
  const [reviews, setReviews] = useState<Review[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    // A large page rather than "everything": analytics is computed across whatever reply drafts
    // exist, and the alternative — paginating the entire review history into the browser to
    // average two numbers — is worse than a bounded sample. Real aggregation belongs on the
    // server once the prompts module has an analytics endpoint.
    ReviewService.getReviews({ pageSize: 100 })
      .then((result) => {
        if (!cancelled) setReviews(result.reviews);
      })
      .catch(() => {
        // Swallowed: analytics is supplementary, and a failed fetch should show empty stats
        // rather than break the prompts screen it decorates.
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const getStats = useCallback(
    (promptId: string, version?: number) => computePromptVersionStats(reviews, promptId, version),
    [reviews],
  );

  return { isLoading, getStats };
}
