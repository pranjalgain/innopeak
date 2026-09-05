import type { PlatformAdminInvite } from "@/types/domain";

export const MOCK_PLATFORM_ADMIN_INVITES: PlatformAdminInvite[] = [
  {
    id: "padmin_ops",
    email: "ops@innopeak.com",
    status: "active",
    invitedAt: "2025-11-10T09:00:00.000Z",
    expiresAt: "2025-11-17T09:00:00.000Z",
  },
  {
    id: "padmin_support",
    email: "support@innopeak.com",
    status: "invited",
    invitedAt: "2026-09-01T09:00:00.000Z",
    expiresAt: "2026-09-08T09:00:00.000Z",
  },
];
