/**
 * Which frontend screen the OAuth callback returns to. A key from a server-side allowlist, never
 * a URL — accepting a raw URL would make the callback an open redirect. `RETURN_TO_PATHS` maps
 * each member to its path.
 */
export enum ReturnTo {
  ONBOARDING = 'onboarding',
  SETTINGS = 'settings',
}
