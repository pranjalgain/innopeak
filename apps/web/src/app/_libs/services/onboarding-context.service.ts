const STORAGE_KEY = "innopeak:onboarding-context";

export interface OnboardingContext {
  /** "signup" means the user arrived mid-wizard and should still see the 3-step stepper. */
  from: "signup";
  /** Which identity method they used, so the stepper knows whether step 2 ("otp") applies. */
  via: "password" | "sso";
}

/**
 * sessionStorage, not a query param (the backend callback redirects to a fixed path and drops params) and not localStorage
 * (per-tab, single-run state). Holds no credential: a tampered value only changes which stepper is drawn.
 */
export class OnboardingContextService {
  static set(context: OnboardingContext): void {
    if (typeof window === "undefined") return;
    try {
      window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(context));
    } catch {
      // Private-mode / disabled storage. The flow still works — the user just sees the standalone
      // connect screen instead of the stepper, which is a cosmetic loss, so this is swallowed.
    }
  }

  static get(): OnboardingContext | null {
    if (typeof window === "undefined") return null;
    try {
      const raw = window.sessionStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as Partial<OnboardingContext>;
      return parsed.from === "signup" && (parsed.via === "password" || parsed.via === "sso")
        ? { from: parsed.from, via: parsed.via }
        : null;
    } catch {
      return null;
    }
  }

  static clear(): void {
    if (typeof window === "undefined") return;
    try {
      window.sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      // See `set`.
    }
  }
}
