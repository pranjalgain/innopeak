import type { Route } from "next";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";

import { LanguageSwitcher } from "@/app/_components/language-switcher";
import { ThemeToggle } from "@/app/_components/theme-toggle";
import { ROUTES } from "@/app/_libs/constants/routes";
import { cn } from "@/app/_libs/utils/cn";
import { InnoPeakLogo } from "@/assets/icons/innopeak-logo";
import { Button } from "@/components/ui/button";
import { type AppLocale, SUPPORTED_LOCALES } from "@/i18n/locales";

const NAV_ITEMS = [
  { key: "features", href: "/#features" },
  { key: "howItWorks", href: "/#how-it-works" },
] as const;

/** The two labels whose width is reserved across locales — see `StableWidthLabel`. */
type ActionKey = "signIn" | "getStarted";

interface LocaleLabel {
  locale: AppLocale;
  text: string;
}

/**
 * Shared navigation for public (unauthenticated) routes — currently just
 * the marketing landing page.
 */
export async function SiteHeader() {
  const activeLocale = (await getLocale()) as AppLocale;
  const t = await getTranslations("marketing.nav");
  const actionLabels = await actionLabelsByLocale();

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
            screen with its own "Already have an account? Sign in" link.

            Both action labels reserve the widest locale's width (`StableWidthLabel`) so that this
            row's total width — and therefore where the two switches sit — doesn't change when the
            locale does. That costs nothing at ~360px: the reserved width is German's, which is
            what the measurements above already had to fit. */}
        <div className="flex items-center gap-1 sm:gap-2">
          <LanguageSwitcher compact />
          <ThemeToggle compact />
          <Button asChild variant="ghost" size="sm" className="hidden sm:inline-flex">
            <Link href={ROUTES.LOGIN as Route}>
              <StableWidthLabel labels={actionLabels.signIn} activeLocale={activeLocale} />
            </Link>
          </Button>
          <Button asChild size="sm">
            <Link href={ROUTES.ONBOARDING_SIGNUP as Route}>
              <StableWidthLabel labels={actionLabels.getStarted} activeLocale={activeLocale} />
            </Link>
          </Button>
        </div>
      </div>
    </header>
  );
}

/**
 * Each action label in *every* supported locale, not just the active one — `StableWidthLabel`
 * needs the alternatives to reserve room for them. `getTranslations({ locale })` reads the same
 * `messages/<locale>.json` the active locale is served from, so nothing here has to be kept in
 * sync by hand as copy changes.
 */
async function actionLabelsByLocale(): Promise<Record<ActionKey, LocaleLabel[]>> {
  const translators = await Promise.all(
    SUPPORTED_LOCALES.map(async (locale) => ({
      locale,
      translate: await getTranslations({ locale, namespace: "marketing.nav" }),
    })),
  );

  const labelsFor = (key: ActionKey): LocaleLabel[] =>
    translators.map(({ locale, translate }) => ({ locale, text: translate(key) }));

  return { signIn: labelsFor("signIn"), getStarted: labelsFor("getStarted") };
}

/**
 * Shows the active locale's label while still occupying the width of the widest locale's copy of
 * it, by stacking every translation in one grid cell and hiding all but the active one.
 *
 * Without this, switching to German widened "Sign in"/"Get started" into "Anmelden"/"Jetzt
 * starten" (+24px and +10px at the header's type size) and the whole right-hand cluster — which
 * is right-aligned, so it grows leftward — dragged `LanguageSwitcher` and `ThemeToggle` 34px to
 * the left with it. Those two are the only things in the row whose own content is identical in
 * both locales, which is exactly why they were the parts that read as *moving* rather than as
 * text simply being longer: the switch a visitor just clicked slid out from under their cursor.
 *
 * `invisible` (`visibility: hidden`) rather than `hidden` or `sr-only` is the whole mechanism —
 * it keeps the box in the layout, which is the width being reserved, while dropping the text from
 * both the rendering and the accessibility tree, so the link's accessible name stays the single
 * active label.
 */
function StableWidthLabel({
  labels,
  activeLocale,
}: {
  labels: readonly LocaleLabel[];
  activeLocale: AppLocale;
}) {
  return (
    <span className="grid grid-cols-1 grid-rows-1 place-items-center">
      {labels.map(({ locale, text }) => (
        <span
          key={locale}
          className={cn(
            "col-start-1 row-start-1 whitespace-nowrap",
            locale !== activeLocale && "invisible",
          )}>
          {text}
        </span>
      ))}
    </span>
  );
}
