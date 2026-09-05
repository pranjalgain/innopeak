import type { SettingsData } from "@/types/domain";

export const MOCK_SETTINGS: SettingsData = {
  general: {
    escalationRatingThreshold: 3,
    autoPostApprovedReplies: false,
    reviewDataRetentionMonths: 24,
    aiReplyCount: 1,
  },
  blocklistTerms: [
    { id: "block_1", term: "lawsuit" },
    { id: "block_2", term: "lawyer" },
    { id: "block_3", term: "food poisoning" },
    { id: "block_4", term: "health inspector" },
  ],
  notificationRecipients: [{ id: "nrecip_1", name: "Maria Delgado", initials: "MD", channel: "both", isActive: true }],
  connection: {
    businessName: "The Coastal Table",
    lastSyncedAt: "2026-09-01T14:15:00Z",
    status: "connected",
  },
};
