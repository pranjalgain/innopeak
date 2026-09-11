import { useQuery } from "@tanstack/react-query";

import { SessionService } from "@/app/_libs/services/session.service";
import type { SessionRole } from "@/types/domain";

export const sessionRoleQueryKey = ["session", "role"] as const;

interface UseSessionResult {
  /** `null` while the initial check is in flight. */
  role: SessionRole | null;
  isLoading: boolean;
}

export function useSession(): UseSessionResult {
  const query = useQuery({
    queryKey: sessionRoleQueryKey,
    queryFn: () => SessionService.getRole(),
  });

  return { role: query.data ?? null, isLoading: query.isLoading };
}
