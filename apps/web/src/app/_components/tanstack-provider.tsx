"use client";


import { QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { type ReactNode, useMemo } from "react";

import { isDevelopmentEnvironment } from "@/app/_libs/utils/is-development-environment";
import { createQueryClient } from "@/app/_libs/utils/query-client";

interface TanstackProviderProps {
  children: ReactNode;
}

/** `useMemo`, not a module-level singleton: each mount needs its own `QueryClient`, since a module-level one is shared across server requests. Interceptors install at import time (`_libs/api-sdk/config.ts`), not via context. */
export function TanstackProvider({ children }: TanstackProviderProps) {
  const queryClient = useMemo(() => createQueryClient(), []);

  return (
    <QueryClientProvider client={queryClient}>
      {isDevelopmentEnvironment() && <ReactQueryDevtools initialIsOpen={false} />}
      {children}
    </QueryClientProvider>
  );
}
