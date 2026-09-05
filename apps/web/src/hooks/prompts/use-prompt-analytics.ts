import * as React from "react";

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
  const [reviews, setReviews] = React.useState<Review[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);

  React.useEffect(() => {
    let cancelled = false;

    ReviewService.getReviews()
      .then((result) => {
        if (!cancelled) setReviews(result);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const getStats = React.useCallback(
    (promptId: string, version?: number) => computePromptVersionStats(reviews, promptId, version),
    [reviews],
  );

  return { isLoading, getStats };
}
