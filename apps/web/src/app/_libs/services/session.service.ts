import type { SessionRole } from "@/types/domain";

const STORAGE_KEY = "innopeak:session-role";

/**
 * Which identity the current mock login belongs to. Backed by localStorage
 * since there's no real backend/session yet — becomes a real session/JWT
 * claim once auth exists. Defaults to "tenant" so a visitor with no session
 * is never mistaken for a super admin.
 */
export class SessionService {
  static async getRole(): Promise<SessionRole> {
    await new Promise((resolve) => setTimeout(resolve, 100));
    if (typeof window === "undefined") return "tenant";
    return window.localStorage.getItem(STORAGE_KEY) === "super_admin" ? "super_admin" : "tenant";
  }

  static async setRole(role: SessionRole): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, 50));
    if (typeof window === "undefined") return;
    window.localStorage.setItem(STORAGE_KEY, role);
  }
}
