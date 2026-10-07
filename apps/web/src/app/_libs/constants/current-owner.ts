/**
 * Mock stand-in used only by `AuthService.resolveLoginDestination` (Microsoft SSO, which the
 * backend does not implement yet). Everything else reads the real admin profile.
 */
export const SUPER_ADMIN_EMAIL = "admin@innopeak.com";
