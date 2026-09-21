/**
 * The three onboarding steps, which now span **two routes**: "identity" and "otp" live on
 * /onboarding/signup, "connect" on /onboarding/connect. The stepper is shared across both so the
 * user sees one continuous 1-2-3 progression rather than a wizard that appears to restart.
 */
export type OnboardingStep = "identity" | "otp" | "connect";
