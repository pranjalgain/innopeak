import { type DefaultOptions, MutationCache, QueryCache, QueryClient } from "@tanstack/react-query";

import type { ApiError } from "@/app/_libs/services/api-error";

declare module "@tanstack/react-query" {
  interface Register {
    defaultError: ApiError;
  }
}

/** No default retries: the axios interceptor (`_libs/api-sdk/config.ts`) already replays a failed request, so react-query only ever sees a final failure. */
const queryConfig: DefaultOptions = {
  queries: {
    retry: false,
    // Only a *failed* query refetches on focus, so a page recovers once the backend is back (one request per focus, not a loop).
    refetchOnWindowFocus: (query) => query.state.status === "error",
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
    // Empty on purpose: errors are handled per call site; these only avoid unhandled-rejection warnings.
    mutationCache: new MutationCache({ onError: () => {} }),
    queryCache: new QueryCache({ onError: () => {} }),
  });
}

export { queryConfig };
