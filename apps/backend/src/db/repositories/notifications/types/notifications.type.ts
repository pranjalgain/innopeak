export interface RawNotificationRow {
  id: string;
  type: string;
  title: string;
  description: string | null;
  reviewId: string | null;
  readAt: string | null;
  createdAt: string;
}

/** A user who should receive tenant-wide notices: active, not anonymized, no erasure pending. */
export interface NotificationRecipientUser {
  id: string;
  /** Null until the user picks a language; the caller falls back to the default. */
  locale: string | null;
}

export interface InsertInAppNotificationInput {
  tenantId: string;
  userId: string;
  type: string;
  title: string;
  description: string | null;
  reviewId: string | null;
  generationGroupId: string | null;
}

/** A row `insertMany` actually wrote (a conflict writes nothing), enough to tell the user they have something new. */
export interface InsertedNotification {
  id: string;
  userId: string;
}
