import * as React from "react";

import { SessionService } from "@/app/_libs/services/session.service";
import type { SessionRole } from "@/types/domain";

interface UseSessionResult {
  /** `null` while the initial check is in flight. */
  role: SessionRole | null;
  isLoading: boolean;
}

export function useSession(): UseSessionResult {
  const [role, setRole] = React.useState<SessionRole | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);

  React.useEffect(() => {
    let cancelled = false;

    SessionService.getRole()
      .then((result) => {
        if (!cancelled) setRole(result);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return { role, isLoading };
}
