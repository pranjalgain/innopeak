import type { CreateAccountFormValues } from "@/app/(auth)/onboarding/signup/_components/create-account-form";
import { SUPER_ADMIN_EMAIL } from "@/app/_libs/constants/current-owner";
import { ROUTES } from "@/app/_libs/constants/routes";
import { SessionService } from "@/app/_libs/services/session.service";

/**
 * Auth service. Mock implementation for now — no backend is wired up yet.
 *
 * This is the only place that will need to change once the real backend auth
 * module exists: `loginWithMicrosoft`/`loginWithPassword`/`loginWithSocial`
 * become redirects to their real auth endpoints (see
 * apps/documentation/docs/backend/auth/api-reference.md) instead of a mock
 * delay + local redirect. Hooks and components never call the backend
 * directly, so nothing above this file needs to change.
 *
 * `email` decides which identity a mock login resolves to: matching
 * `SUPER_ADMIN_EMAIL` routes to the Super Admin area instead of the tenant
 * dashboard, mirroring how the real backend keeps `platform_admins` as a
 * separate identity from tenant `users` rather than a role on the same table.
 */
export class AuthService {
  private static async resolveLoginDestination(email: string): Promise<string> {
    const isSuperAdmin = email.trim().toLowerCase() === SUPER_ADMIN_EMAIL;
    await SessionService.setRole(isSuperAdmin ? "super_admin" : "tenant");
    return isSuperAdmin ? ROUTES.ADMIN : ROUTES.DASHBOARD;
  }

  static async loginWithMicrosoft(email: string): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, 600));
    window.location.assign(await this.resolveLoginDestination(email));
  }

  static async loginWithPassword(email: string): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, 600));
    window.location.assign(await this.resolveLoginDestination(email));
  }

  static async loginWithSocial(): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, 600));
    window.location.assign(await this.resolveLoginDestination(""));
  }

  /**
   * Verifies identity during signup — unlike the login methods, these never
   * redirect: the signup wizard still has a Google Business Profile
   * connection step to complete before landing on the dashboard. Signup
   * always creates a tenant, never a super admin.
   */
  static async signupWithMicrosoft(): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, 600));
    await SessionService.setRole("tenant");
  }

  static async signupWithPassword(_values: CreateAccountFormValues): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, 600));
    await SessionService.setRole("tenant");
  }

  static async signupWithSocial(): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, 600));
    await SessionService.setRole("tenant");
  }

  /**
   * Mocks verifying the OTP sent after a password signup — mirrors the real
   * `users.email_verified_at` column (`apps/backend`'s `0002_tenant_auth.sql`),
   * set once verification succeeds. Any complete 6-digit code is accepted;
   * the caller is what enforces the 6-digit shape before this is called.
   */
  static async verifySignupOtp(_code: string): Promise<boolean> {
    await new Promise((resolve) => setTimeout(resolve, 500));
    return true;
  }

  static async resendSignupOtp(): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, 400));
  }

  static async logout(): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, 200));
    await SessionService.setRole("tenant");
    window.location.assign(ROUTES.LOGIN);
  }
}
