"use client";

import type { Route } from "next";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { useTranslations } from "next-intl";

import { AuthDivider } from "@/app/(auth)/_components/auth-divider";
import { AuthLogo } from "@/app/(auth)/_components/auth-logo";
import { PasswordAuthForm } from "@/app/(auth)/_components/password-auth-form";
import { SocialAuthButtons } from "@/app/(auth)/_components/social-auth-buttons";
import { ROUTES } from "@/app/_libs/constants/routes";
import { useAdminLogin } from "@/hooks/auth/use-admin-login";
import { useOAuthErrorToast } from "@/hooks/auth/use-oauth-error-toast";
import { usePlatformSettings } from "@/hooks/common/use-platform-settings";

/**
 * Platform-admin sign-in — its own screen against its own route
 * (`POST /v1/admin/auth/login`), separate from the tenant `LoginView`. No signup link and no OTP
 * step: admins can't self-register, they're invited at `(auth)/invite/[token]`. See
 * `separate-admin-login-design.md`.
 *
 * Carries the same small link back that `LoginView` carries forward to here, so a tenant user who
 * lands on this screen — a stale bookmark, a link shared out of context — has a way off it besides
 * guessing `/login`. "Invalid email or password" reads identically whether the account doesn't
 * exist here at all or the password is genuinely wrong, so without this the only way out is
 * already knowing the tenant route exists.
 *
 * The Google button is not optional decoration. An admin who accepted their invite through Google
 * has no `password_hash` at all, so the form above can never sign them in — Google is their only
 * way back, which is exactly why `AdminSettingsService.updatePlatformSettings` refuses to turn
 * `socialLoginEnabled` off while any such admin exists. It is gated on that same setting, so the
 * button and the backend guard protecting it agree.
 *
 * It points at `/v1/admin/auth/google`, not the tenant button's route: that one falls through to
 * the tenant tables when no admin identity matches (so this screen could hand back a *tenant*
 * session) and sends failures to `/login`, which carries no admin path.
 *
 * Reuses `PasswordAuthForm`/`AuthLogo`/`SocialAuthButtons` so this screen inherits the `(auth)`
 * route group's chrome unchanged rather than duplicating it.
 */
export function AdminLoginView() {
  const t = useTranslations("auth.adminLogin");
  useOAuthErrorToast();
  const router = useRouter();
  const { loginAsAdmin, startAdminGoogleLogin, isLoading } = useAdminLogin();
  const { data: platformSettings } = usePlatformSettings();

  // Hidden while the setting is still loading, same trade-off the tenant screen makes: the
  // password form is always there, so a button appearing a beat later is a non-issue.
  const socialEnabled = platformSettings?.socialLoginEnabled ?? false;

  const handleSubmit = async (email: string, password: string) => {
    const succeeded = await loginAsAdmin(email, password);
    if (!succeeded) return;

    // Sign-in may have just restored this admin's saved language into the locale cookie
    // (`AuthService.loginAsAdmin`). That cookie is read on the server, so without dropping the
    // router cache the next screen renders from a payload produced before it existed — an admin
    // whose preference is German lands on one English page and only gets German on the navigation
    // after that.
    router.refresh();
    router.push(ROUTES.ADMIN);
  };

  return (
    <>
      <AuthLogo />

      <div className="animate-in fade-in slide-in-from-bottom-2 fill-mode-backwards p-fluid-page border-border bg-card shadow-elevated ease-fluid w-full max-w-[420px] rounded-xl border duration-500">
        <h1 className="text-gradient mb-7 text-center text-xl font-semibold">{t("title")}</h1>

        <PasswordAuthForm
          isLoading={isLoading}
          onSubmit={(email, password) => void handleSubmit(email, password)}
        />

        {socialEnabled ? (
          <>
            <AuthDivider label={t("orDivider")} />
            <SocialAuthButtons
              isLoading={isLoading}
              onGoogleClick={startAdminGoogleLogin}
              label={t("continueWithGoogle")}
            />
          </>
        ) : null}

        <div className="text-muted-foreground mt-6 text-center text-xs">
          {t("notAdmin")}{" "}
          <Link href={ROUTES.LOGIN as Route} className="font-medium">
            {t("tenantSignIn")}
          </Link>
        </div>
      </div>
    </>
  );
}
