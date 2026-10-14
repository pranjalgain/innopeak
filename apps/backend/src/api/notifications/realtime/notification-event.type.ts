/** Ids only, never content: the browser fetches the notice through the normal tenant-checked API. */
export interface NotificationStreamEvent {
  userId: string;
  notificationId: string;
}

export interface NotificationStreamMessage {
  events: NotificationStreamEvent[];
}
