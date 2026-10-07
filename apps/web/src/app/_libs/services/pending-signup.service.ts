const STORAGE_KEY = "innopeak:pending-signup";

/** Past this the emailed code is stale anyway; "Resend code" is still offered. */
const MAX_AGE_MS = 30 * 60 * 1000;

/**
 * Remembers which email awaits its code across a refresh or Back/Forward, so the OTP step survives instead of a blank signup
 * form whose re-submit is refused. Stores only the email, in this tab's sessionStorage; it changes nothing about who may claim an address.
 */
export class PendingSignupService {
  static set(email: string): void {
    if (typeof window === "undefined") return;
    try {
      window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ email, savedAt: Date.now() }));
    } catch {
      // Storage disabled (private mode): the flow still works, a refresh just starts over.
    }
  }

  static get(): string | null {
    if (typeof window === "undefined") return null;
    try {
      const raw = window.sessionStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as { email?: unknown; savedAt?: unknown };
      if (
        typeof parsed.email !== "string" ||
        !parsed.email.includes("@") ||
        typeof parsed.savedAt !== "number" ||
        Date.now() - parsed.savedAt > MAX_AGE_MS
      ) {
        this.clear();
        return null;
      }
      return parsed.email;
    } catch {
      return null;
    }
  }

  static clear(): void {
    if (typeof window === "undefined") return;
    try {
      window.sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      // Nothing to clean up if storage is unavailable.
    }
  }
}
