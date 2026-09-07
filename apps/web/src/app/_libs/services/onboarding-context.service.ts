const STORAGE_KEY = "innopeak:onboarding-context";

export interface OnboardingContext {
  /** "signup" means the user arrived mid-wizard and should still see the 3-step stepper. */
  from: "signup";
  /** Which identity method they used, so the stepper knows whether step 2 ("otp") applies. */
  via: "password" | "sso";
}

/**
 * Carries "you are still inside the signup wizard" across the OAuth round trip.
 *
 * sessionStorage rather than a query param because the backend's callback redirects to a *fixed*
 * path and drops anything the client appended — the browser leaves for Google carrying our params
 * and comes back carrying Google's. sessionStorage rather than localStorage because this is
 * per-tab, single-run state: a second tab is a different run, and it must not outlive the browser
 * session.
 *
 * It holds no credential and nothing security-relevant — only which stepper to draw. A tampered
 * value shows the wrong step count, nothing more.
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
