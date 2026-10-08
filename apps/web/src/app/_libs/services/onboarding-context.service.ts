const STORAGE_KEY = "innopeak:onboarding-context";

export interface OnboardingContext {
  /** "signup" means the user arrived mid-wizard and should still see the 3-step stepper. */
  from: "signup";
  /** Which identity method they used, so the stepper knows whether step 2 ("otp") applies. */
  via: "password" | "sso";
  /**
   * The plan the user picked on /onboarding/plan: "free" when they clicked Continue with Free, "paid" once they came back from
   * a completed checkout. Unset means they have not chosen yet, which keeps /onboarding/connect closed to them.
   */
  plan?: OnboardingPlanChoice;
}

export type OnboardingPlanChoice = "free" | "paid";

/**
 * Marks a context written by a build that gates /onboarding/connect on a plan choice. One written before (no marker, no
 * `plan`) belongs to someone who was mid-wizard when it shipped; they could only have reached the connect screen by
 * choosing Free or coming back from checkout, so it reads as "free" rather than bouncing them back to the plan screen.
 * TRANSITIONAL: sessionStorage dies with the tab, so the unmarked branch in `get` can be deleted (and every context read as
 * marked) once this has been deployed for a week.
 */
interface StoredOnboardingContext extends OnboardingContext {
  planGated?: boolean;
}

/**
 * sessionStorage, not a query param (the backend callback redirects to a fixed path and drops params) and not localStorage
 * (per-tab, single-run state). Holds no credential: a tampered value only changes which stepper is drawn.
 */
export class OnboardingContextService {
  static set(context: OnboardingContext): void {
    if (typeof window === "undefined") return;
    try {
      const stored: StoredOnboardingContext = { ...context, planGated: true };
      window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
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
      const parsed = JSON.parse(raw) as Partial<StoredOnboardingContext>;
      if (parsed.from !== "signup" || (parsed.via !== "password" && parsed.via !== "sso")) {
        return null;
      }
      if (parsed.planGated !== true) {
        return { from: parsed.from, via: parsed.via, plan: parsed.plan === "paid" ? "paid" : "free" };
      }
      return parsed.plan === "free" || parsed.plan === "paid"
        ? { from: parsed.from, via: parsed.via, plan: parsed.plan }
        : { from: parsed.from, via: parsed.via };
    } catch {
      return null;
    }
  }

  /** No-op outside a signup wizard: without a context there is nothing gating the connect screen. */
  static setPlan(plan: OnboardingPlanChoice): void {
    const context = this.get();
    if (context) this.set({ ...context, plan });
  }

  static clearPlan(): void {
    const context = this.get();
    if (context) this.set({ from: context.from, via: context.via });
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
