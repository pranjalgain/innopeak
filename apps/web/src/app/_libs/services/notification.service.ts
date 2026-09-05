import { MOCK_NOTIFICATIONS } from "@/app/_libs/mock-data/notifications";
import type { Notification } from "@/types/domain";

/**
 * Notification service. Mock implementation — becomes a real backend call
 * (plus a live push channel) once that API exists. Hooks and components
 * only ever call `useNotifications`, never this class directly.
 */
export class NotificationService {
  static async list(): Promise<Notification[]> {
    await new Promise((resolve) => setTimeout(resolve, 200));
    return structuredClone(MOCK_NOTIFICATIONS);
  }

  static async markAsRead(_id: string): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, 150));
  }

  static async markAllAsRead(): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
}
