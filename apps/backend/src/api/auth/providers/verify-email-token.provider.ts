/** Generates the 6-digit signup/login verification OTP — swapped by environment in AuthModule's factory. */
export abstract class VerifyEmailTokenProvider {
  abstract generate(): string;
}
