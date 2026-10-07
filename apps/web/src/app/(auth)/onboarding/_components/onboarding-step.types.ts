/** Four steps across three routes (identity/otp on signup, plan, connect); the stepper is shared so progress reads as continuous. */
export type OnboardingStep = "identity" | "otp" | "plan" | "connect";
