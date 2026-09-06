/** Trim + lowercase — see the auth API reference's Email normalization section. */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Same normalization, for use in a class-transformer `@Transform` where the raw value is untyped. */
export function normalizeEmailInput(value: unknown): unknown {
  return typeof value === 'string' ? normalizeEmail(value) : value;
}
