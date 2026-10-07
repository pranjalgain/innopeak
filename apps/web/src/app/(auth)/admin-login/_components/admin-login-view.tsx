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
 * Platform-admin sign-in (`POST /v1/admin/auth/login`), separate from the tenant `LoginView`: no signup link or OTP,
 * admins are invited. The link back to the tenant login gives a stray tenant user a way off this screen.
 * The Google button is required: an admin who accepted via Google has no `password_hash`, so it is their only way in
 * (hence `AdminSettingsService.updatePlatformSettings` refuses to disable `socialLoginEnabled` while one exists).
 * It points at `/v1/admin/auth/google`, not the tenant route, which falls through to tenant tables and sends failures to `/login`.
 */
export function AdminLoginView() {
  const t = useTranslations("auth.adminLogin");
  useOAuthErrorToast();
  const router = useRouter();
  const { loginAsAdmin, startAdminGoogleLogin, isLoading } = useAdminLogin();
  const { data: platformSettings } = usePlatformSettings();

  // Hidden while the setting loads; the password form is always there, so a late button is fine.
  const socialEnabled = platformSettings?.socialLoginEnabled ?? false;

  const handleSubmit = async (email: string, password: string) => {
    const succeeded = await loginAsAdmin(email, password);
    if (!succeeded) return;

    // Sign-in may restore the admin's saved language into the locale cookie, which the server reads; without dropping
    // the router cache the next screen renders from a stale payload (German only after the navigation after that).
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
