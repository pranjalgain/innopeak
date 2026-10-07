import { useQueries, useQuery } from "@tanstack/react-query";
import { useCallback, useMemo } from "react";

import { PromptService } from "@/app/_libs/services/prompt.service";
import { getCurrentVersion } from "@/app/_libs/utils/prompt";
import type { AiPrompt, PromptVersionStats } from "@/types/domain";

export function promptVersionStatsQueryKey(promptId: string, version: number) {
  return ["prompt-version-stats", promptId, version] as const;
}

function statsKey(promptId: string, version: number): string {
  return `${promptId}:${version}`;
}

const EMPTY_STATS: PromptVersionStats = {
  totalGenerated: 0,
  approvedCount: 0,
  approvedAsIsCount: 0,
  approvedEditedCount: 0,
  rejectedCount: 0,
  pendingCount: 0,
  supersededCount: 0,
  averageDecisionMinutes: null,
};

export interface PromptVersionPair {
  promptId: string;
  version: number;
}

interface UsePromptVersionStatsResult {
  isLoading: boolean;
  getStats: (promptId: string, version?: number) => PromptVersionStats;
}

/** One stats query per (promptId, version) pair. `enabled` lets callers build pairs eagerly (`useQueries` needs a stable hook count) but defer firing; `getStats` reads an unresolved pair as all-zero/`null`, so callers need no loading branch. */
export function usePromptVersionStatsQueries(
  pairs: PromptVersionPair[],
  enabled = true,
): UsePromptVersionStatsResult {
  const results = useQueries({
    queries: pairs.map(({ promptId, version }) => ({
      queryKey: promptVersionStatsQueryKey(promptId, version),
      queryFn: () => PromptService.getVersionStats(promptId, version),
      enabled,
    })),
  });

  const statsByKey = useMemo(() => {
    const map = new Map<string, PromptVersionStats>();
    pairs.forEach(({ promptId, version }, index) => {
      const data = results[index]?.data;
      if (data) map.set(statsKey(promptId, version), data);
    });
    return map;
  }, [pairs, results]);

  const getStats = useCallback(
    (promptId: string, version?: number): PromptVersionStats => {
      if (version === undefined) return EMPTY_STATS;
      return statsByKey.get(statsKey(promptId, version)) ?? EMPTY_STATS;
    },
    [statsByKey],
  );

  const isLoading = enabled && results.some((result) => result.isLoading);

  return { isLoading, getStats };
}

function promptStatsBatchQueryKey(pairs: PromptVersionPair[]) {
  return ["prompt-stats-batch", pairs.map(({ promptId, version }) => statsKey(promptId, version))] as const;
}

/** Stats for every prompt's current version in one `POST /v1/prompts/stats/batch`, not a request per prompt. Historical versions are fetched lazily by `PromptVersionHistory`. */
export function usePromptAnalytics(prompts: AiPrompt[]): UsePromptVersionStatsResult {
  const pairs = useMemo(
    () =>
      prompts.map((prompt) => ({
        promptId: prompt.id,
        version: getCurrentVersion(prompt).version,
      })),
    [prompts],
  );

  const { data, isLoading } = useQuery({
    queryKey: promptStatsBatchQueryKey(pairs),
    queryFn: () => PromptService.getVersionStatsBatch(pairs),
    enabled: pairs.length > 0,
  });

  const statsByKey = useMemo(() => {
    const map = new Map<string, PromptVersionStats>();
    (data ?? []).forEach((item) => {
      map.set(statsKey(item.promptId, item.version), item.stats);
    });
    return map;
  }, [data]);

  const getStats = useCallback(
    (promptId: string, version?: number): PromptVersionStats => {
      if (version === undefined) return EMPTY_STATS;
      return statsByKey.get(statsKey(promptId, version)) ?? EMPTY_STATS;
    },
    [statsByKey],
  );

  return { isLoading: pairs.length > 0 && isLoading, getStats };
}
