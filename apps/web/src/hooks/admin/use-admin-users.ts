import { useCallback, useEffect, useState } from "react";

import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { AdminUserService } from "@/app/_libs/services/admin-user.service";
import type { AdminUser } from "@/types/domain";

interface UseAdminUsersResult {
  users: AdminUser[];
  isLoading: boolean;
  toggleActive: (id: string) => Promise<void>;
}

export function useAdminUsers(): UseAdminUsersResult {
  const t = useTranslations("adminUsers.toasts");
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    AdminUserService.getUsers()
      .then((result) => {
        if (!cancelled) setUsers(result);
      })
      .catch(() => {
        if (!cancelled) toast.error(t("loadFailed"));
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [t]);

  const toggleActive = useCallback(
    async (id: string) => {
      try {
        const updated = await AdminUserService.toggleActive(id);
        setUsers((prev) => prev.map((user) => (user.id === id ? updated : user)));
      } catch {
        toast.error(t("updateFailed"));
      }
    },
    [t],
  );

  return { users, isLoading, toggleActive };
}
