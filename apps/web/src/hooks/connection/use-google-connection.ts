import * as React from "react";

import { GoogleConnectionService } from "@/app/_libs/services/google-connection.service";
import type { ConnectionStatus } from "@/types/domain";

interface UseGoogleConnectionResult {
  /** `null` while the initial check is in flight. */
  status: ConnectionStatus | null;
  isLoading: boolean;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
}

export function useGoogleConnection(): UseGoogleConnectionResult {
  const [status, setStatus] = React.useState<ConnectionStatus | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);

  React.useEffect(() => {
    let cancelled = false;

    GoogleConnectionService.getStatus()
      .then((result) => {
        if (!cancelled) setStatus(result);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const connect = React.useCallback(async () => {
    await GoogleConnectionService.setStatus("connected");
    setStatus("connected");
  }, []);

  const disconnect = React.useCallback(async () => {
    await GoogleConnectionService.setStatus("disconnected");
    setStatus("disconnected");
  }, []);

  return { status, isLoading, connect, disconnect };
}
