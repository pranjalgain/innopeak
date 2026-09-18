import type { Route } from "next";
import Link from "next/link";
import { useTranslations } from "next-intl";

import { LanguageSwitcher } from "@/app/_components/language-switcher";
import { ROUTES } from "@/app/_libs/constants/routes";
import { InnoPeakLogo } from "@/assets/icons/innopeak-logo";
import { Button } from "@/components/ui/button";

const NAV_ITEMS = [
  { key: "features", href: "/#features" },
  { key: "howItWorks", href: "/#how-it-works" },
] as const;

/**
 * Shared navigation for public (unauthenticated) routes — currently just
 * the marketing landing page.
 */
export function SiteHeader() {
  const t = useTranslations("marketing.nav");

  return (
    <header className="sticky top-0 z-50 border-b border-border/70 bg-background/80 px-4 backdrop-blur-xl sm:px-6 lg:px-8">
      <div className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between">
        <Link href={ROUTES.HOME as Route} className="flex items-center rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <InnoPeakLogo className="h-8 w-auto" />
        </Link>

        <nav className="hidden items-center gap-1 lg:flex" aria-label="Primary navigation">
          {NAV_ITEMS.map((item) => (
            <Button key={item.key} asChild variant="ghost" size="sm">
              <Link href={item.href as Route}>{t(item.key)}</Link>
            </Button>
          ))}
        </nav>

        {/* `gap-1` below `sm` only — German's longer "Anmelden"/"Jetzt starten" leave this row
            a few pixels short of fitting at the narrowest real phone widths (~360px); `sm:gap-2`
            restores the original spacing the moment there's room for it, so nothing changes
            above ~375px. `compact` on the switch buys back the width its default size (tuned for
            pages with room to spare) would otherwise cost here — see that prop's own comment.
            `ThemeToggle` is deliberately not here at all — this row has no width budget left for
            a second control on top of that, even a compact one. It's still reachable from
            `(auth)/layout.tsx` one click away (Sign in), and every authenticated screen. */}
        <div className="flex items-center gap-1 sm:gap-2">
          <LanguageSwitcher compact />
          <Button asChild variant="ghost" size="sm">
            <Link href={ROUTES.LOGIN as Route}>{t("signIn")}</Link>
          </Button>
          <Button asChild size="sm">
            <Link href={ROUTES.ONBOARDING_SIGNUP as Route}>{t("getStarted")}</Link>
          </Button>
        </div>
      </div>
    </header>
  );
}
