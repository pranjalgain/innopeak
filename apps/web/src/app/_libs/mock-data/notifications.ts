import type { Notification } from "@/types/domain";

export const MOCK_NOTIFICATIONS: Notification[] = [
  {
    id: "notif_01",
    type: "review_escalated",
    title: "Review escalated",
    description: "A 1-star review from Jordan P. was flagged for low rating and needs your attention.",
    createdAt: "2026-09-03T09:15:00.000Z",
    isRead: false,
    reviewId: "rev_03",
  },
  {
    id: "notif_02",
    type: "reply_needs_approval",
    title: "Reply ready for approval",
    description: "An AI-drafted reply to Sam T.'s review is waiting for your approval.",
    createdAt: "2026-09-03T07:40:00.000Z",
    isRead: false,
    reviewId: "rev_04",
  },
  {
    id: "notif_03",
    type: "review_escalated",
    title: "Blocklist match found",
    description: "A new review mentions a blocked term and was routed to escalation.",
    createdAt: "2026-09-02T18:05:00.000Z",
    isRead: false,
    reviewId: "rev_05",
  },
  {
    id: "notif_04",
    type: "reply_approved",
    title: "Reply sent",
    description: "Your approved reply to Alex R.'s review was posted to Google.",
    createdAt: "2026-09-02T11:30:00.000Z",
    isRead: true,
    reviewId: "rev_01",
  },
  {
    id: "notif_05",
    type: "connection_issue",
    title: "Google sync delayed",
    description: "New reviews may take longer than usual to appear while Google Business Profile sync recovers.",
    createdAt: "2026-09-01T14:00:00.000Z",
    isRead: true,
  },
];
