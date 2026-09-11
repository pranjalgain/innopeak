import { type DefaultOptions, MutationCache, QueryCache, QueryClient } from "@tanstack/react-query";

import type { ApiError } from "@/app/_libs/services/api-error";

// Types every TanStack Query/Mutation error as this app's own ApiError, so `error` in
// onError/useQuery/useMutation is that shape everywhere — no casts at each call site.
declare module "@tanstack/react-query" {
  interface Register {
    defaultError: ApiError;
  }
}

/**
 * No default retries: unlike some setups that retry once after a silent token refresh, this
 * app's axios interceptor (`_libs/api-sdk/config.ts`) already replays a failed request itself,
 * inside the interceptor, before the promise ever reaches react-query — a query/mutation here
 * only ever sees a *final* failure, so retrying it again would just repeat a already-failed call.
 */
const queryConfig: DefaultOptions = {
  queries: {
    retry: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: true,
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  },
  mutations: {
    retry: false,
  },
};

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: queryConfig,
    // Empty on purpose: errors are handled per call site (each hook's own onError/toast), not
    // globally here — these just exist so a query with no local error handler doesn't produce an
    // unhandled-rejection warning.
    mutationCache: new MutationCache({ onError: () => {} }),
    queryCache: new QueryCache({ onError: () => {} }),
  });
}

export { queryConfig };
