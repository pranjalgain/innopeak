import type { Route } from "next";
import Link from "next/link";
import { useTranslations } from "next-intl";

import { ROUTES } from "@/app/_libs/constants/routes";
import { InnoPeakLogo } from "@/assets/icons/innopeak-logo";

/**
 * Shared footer for public (unauthenticated) routes.
 */
export function SiteFooter() {
  const t = useTranslations("marketing.footer");

  return (
    <footer className="border-t border-border/70 px-4 sm:px-6 lg:px-8">
      <div className="mx-auto grid w-full max-w-7xl gap-10 py-12 md:grid-cols-[1fr_auto]">
        <div>
          <InnoPeakLogo className="h-7 w-auto" />
          <p className="mt-4 max-w-md text-sm leading-6 text-muted-foreground">{t("tagline")}</p>
        </div>

        <nav className="flex flex-wrap items-start gap-x-6 gap-y-3 text-sm" aria-label="Footer">
          <Link href={ROUTES.LOGIN as Route} className="text-muted-foreground transition-colors hover:text-foreground">
            {t("signIn")}
          </Link>
          <Link
            href={ROUTES.ONBOARDING_SIGNUP as Route}
            className="text-muted-foreground transition-colors hover:text-foreground"
          >
            {t("getStarted")}
          </Link>
        </nav>

        <p className="text-xs text-muted-foreground md:col-span-2">
          {t("copyright", { year: new Date().getFullYear() })}
        </p>
      </div>
    </footer>
  );
}
