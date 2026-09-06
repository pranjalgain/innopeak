import type { PlatformActivityEntry } from "@/types/domain";

const SUPER_ADMIN_EMAIL = "admin@innopeak.com";

/** Computed from `Date.now()` at load time so these entries always read as recent, rather than aging out like a fixed calendar date would. */
function hoursAgo(hours: number): string {
  return new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
}

export const MOCK_ADMIN_ACTIVITY: PlatformActivityEntry[] = [
  {
    id: "activity_01",
    type: "business_suspended",
    actorEmail: SUPER_ADMIN_EMAIL,
    businessName: "Oak & Iron Hardware",
    occurredAt: hoursAgo(6),
  },
  {
    id: "activity_02",
    type: "admin_invite_sent",
    actorEmail: SUPER_ADMIN_EMAIL,
    email: "priya.ops@innopeak.com",
    occurredAt: hoursAgo(29),
  },
  {
    id: "activity_03",
    type: "business_reactivated",
    actorEmail: SUPER_ADMIN_EMAIL,
    businessName: "Pinecrest Auto Repair",
    occurredAt: hoursAgo(52),
  },
  {
    id: "activity_04",
    type: "admin_invite_revoked",
    actorEmail: SUPER_ADMIN_EMAIL,
    email: "temp.contractor@innopeak.com",
    occurredAt: hoursAgo(96),
  },
  {
    id: "activity_05",
    type: "business_suspended",
    actorEmail: SUPER_ADMIN_EMAIL,
    businessName: "Bluewave Day Spa",
    occurredAt: hoursAgo(150),
  },
];
