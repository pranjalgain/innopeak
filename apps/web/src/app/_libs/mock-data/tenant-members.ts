import type { TenantMember } from "@/types/domain";

export const MOCK_TENANT_MEMBERS: TenantMember[] = [
  {
    id: "user_maria",
    name: "Maria Delgado",
    email: "maria@coastaltable.com",
    role: "owner",
    status: "active",
    invitedAt: "2025-11-02T09:00:00.000Z",
  },
  {
    id: "user_diego",
    name: "Diego Santos",
    email: "diego@coastaltable.com",
    role: "member",
    status: "active",
    invitedAt: "2025-11-18T09:00:00.000Z",
  },
  {
    id: "user_priya_front",
    name: "Priya Chandran",
    email: "priya@coastaltable.com",
    role: "member",
    status: "invited",
    invitedAt: "2026-09-01T09:00:00.000Z",
  },
];
