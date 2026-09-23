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

/**
 * One `GET /v1/prompts/:promptId/versions/:version/stats` query per (promptId, version) pair
 * given — no more, no less. `enabled` lets a caller build the pairs eagerly (so `useQueries`'
 * hook count stays stable across renders, which it requires) but skip actually firing them until
 * something makes them worth fetching — `PromptVersionHistory` uses this to fetch only the
 * couple of versions its own pagination is currently showing, and not at all while its section is
 * still collapsed, rather than every version of every prompt up front.
 *
 * `getStats` keeps the same synchronous lookup signature every render call site depends on — a
 * pair that hasn't resolved yet (or was never requested) reads as all-zero/`null` rather than
 * `undefined`, so nothing downstream needs a loading branch of its own.
 */
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

/**
 * Stats for every prompt's *current* version only — the summary strip and each prompt card's own
 * stats line, both always visible. Historical versions are fetched separately and lazily, by
 * `PromptVersionHistory` itself, only once (and only for) whichever page of its own history a
 * user actually expands — see `usePromptVersionStatsQueries`'s own doc comment for why.
 *
 * One `POST /v1/prompts/stats/batch` request for every prompt at once, not one
 * `GET .../stats` request per prompt — `useQueries` (what this used before) put a query on the
 * network per prompt in the list, so a 20-prompt tenant fired 20 simultaneous requests just to
 * render the list.
 */
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
