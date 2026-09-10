// @ts-nocheck
/* tslint:disable */
/* eslint-disable */

export interface SignupDto {
  /**
   * The tenant/company name — a stable identifier for the account, distinct from `locations.name` (the per-location name synced from a connected Google Business Profile). One tenant can have several locations, so the tenant name can never be derived from a single location connection; it has to be collected directly. Leading/trailing whitespace is trimmed before validation.
   */
  businessName: string;
  /**
   * Leading/trailing whitespace is trimmed before validation.
   */
  ownerName: string;
  email: string;
  /**
   * At least one uppercase letter, one lowercase letter, one digit, and one special character (any non-alphanumeric, non-whitespace character — `#`, `-`, `_`, `~`, … all count).
   */
  password: string;
}
