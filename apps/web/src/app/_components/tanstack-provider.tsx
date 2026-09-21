"use client";


import { QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { type ReactNode, useMemo } from "react";

import { isDevelopmentEnvironment } from "@/app/_libs/utils/is-development-environment";
import { createQueryClient } from "@/app/_libs/utils/query-client";

interface TanstackProviderProps {
  children: ReactNode;
}

/**
 * Mounted once at the root layout. `useMemo` (not a module-level singleton) so each mount gets
 * its own `QueryClient` — the correct App Router pattern, since a module-level instance would be
 * reused across requests on the server. Nothing else in this tree depends on being inside it
 * (unlike a setup with an axios-interceptor context provider): this app's interceptors are
 * installed at import time (`_libs/api-sdk/config.ts`), not via React context.
 */
export function TanstackProvider({ children }: TanstackProviderProps) {
  const queryClient = useMemo(() => createQueryClient(), []);

  return (
    <QueryClientProvider client={queryClient}>
      {isDevelopmentEnvironment() && <ReactQueryDevtools initialIsOpen={false} />}
      {children}
    </QueryClientProvider>
  );
}
