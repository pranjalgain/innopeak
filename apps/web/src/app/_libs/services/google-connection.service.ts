import type { ConnectionStatus } from "@/types/domain";

const STORAGE_KEY = "innopeak:google-connection-status";

/**
 * Whether this tenant has connected a Google Business Profile — the single
 * source of truth the dashboard access guard, the onboarding-connect flow,
 * and Settings' Connection tab all read/write. Backed by localStorage since
 * there's no real backend/session yet; becomes a real `GET/POST
 * /v1/tenant/google-connection`-style call once that API exists. Defaults
 * to "disconnected" so a first-time visitor is gated to onboarding.
 */
export class GoogleConnectionService {
  static async getStatus(): Promise<ConnectionStatus> {
    await new Promise((resolve) => setTimeout(resolve, 150));
    if (typeof window === "undefined") return "disconnected";
    return window.localStorage.getItem(STORAGE_KEY) === "connected" ? "connected" : "disconnected";
  }

  static async setStatus(status: ConnectionStatus): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, 100));
    if (typeof window === "undefined") return;
    window.localStorage.setItem(STORAGE_KEY, status);
  }
}
