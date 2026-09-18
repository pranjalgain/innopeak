import type { Route } from "next";
import Link from "next/link";
import { useTranslations } from "next-intl";

import { LanguageSwitcher } from "@/app/_components/language-switcher";
import { ThemeToggle } from "@/app/_components/theme-toggle";
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

        {/* `gap-1` below `sm` only — German's longer "Anmelden"/"Jetzt starten" already left this
            row a few pixels short of fitting at the narrowest real phone widths (~360px) before
            `ThemeToggle` existed; `sm:gap-2` restores the original spacing the moment there's room
            for it. `compact` on both switches buys back some of the width their default size
            (tuned for pages with room to spare) would otherwise cost here — see that prop's own
            comment on each.

            `ThemeToggle` used to be left out of this row entirely on the theory that a marketing
            visitor could always reach it one click away at sign-in — but an unauthenticated
            visitor who only ever looks at the landing page never gets that click, so the row
            carries both controls now. There simply isn't 48px more to spare below `sm` on top of
            an already-tight row, verified by measuring the layout viewport a real ~360px phone is
            forced to at each step: `Sign in` is what goes to make room, hidden below `sm` rather
            than shrunk further (no smaller `Button` size exists) or dropped for everyone. It's a
            redundant path at that width, not a lost one — `getStarted` already leads to a signup
            screen with its own "Already have an account? Sign in" link. */}
        <div className="flex items-center gap-1 sm:gap-2">
          <LanguageSwitcher compact />
          <ThemeToggle compact />
          <Button asChild variant="ghost" size="sm" className="hidden sm:inline-flex">
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
