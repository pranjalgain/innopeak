/**
 * Mock stand-in for "this login belongs to a super admin", used by the one sign-in path that is
 * still mocked end to end: `AuthService.resolveLoginDestination`, reached only from Microsoft SSO,
 * which the backend does not implement at all yet. Password login no longer guesses from the email
 * — `POST /v1/auth/login` resolves the identity space itself and says so in its response.
 *
 * Nothing renders a super admin's *identity* from a constant any more: the shell and Settings both
 * read `GET /v1/admin/settings/profile` through `usePlatformAdminProfile`, and derive a display
 * name from the real email (`platformAdminDisplayName`).
 */
export const SUPER_ADMIN_EMAIL = "admin@innopeak.com";
