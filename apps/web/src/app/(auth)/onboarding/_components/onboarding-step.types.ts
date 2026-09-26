/**
 * The four onboarding steps, which now span **three routes**: "identity" and "otp" live on
 * /onboarding/signup, "plan" on /onboarding/plan, "connect" on /onboarding/connect. The stepper is
 * shared across all three so the user sees one continuous progression rather than a wizard that
 * appears to restart.
 */
export type OnboardingStep = "identity" | "otp" | "plan" | "connect";
