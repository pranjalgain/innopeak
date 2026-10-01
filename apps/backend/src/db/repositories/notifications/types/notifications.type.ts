export interface RawNotificationRow {
  id: string;
  type: string;
  title: string;
  description: string | null;
  reviewId: string | null;
  readAt: string | null;
  createdAt: string;
}
