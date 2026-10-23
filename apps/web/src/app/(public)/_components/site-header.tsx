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

/** The two labels whose width is reserved across locales (`StableWidthLabel`). */
type ActionKey = "signIn" | "getStarted";

interface LocaleLabel {
  locale: AppLocale;
  text: string;
}

export async function SiteHeader() {
  const activeLocale = (await getLocale()) as AppLocale;
  const t = await getTranslations("marketing.nav");
  const actionLabels = await actionLabelsByLocale();

  return (
    <header className="sticky top-0 z-50 border-b border-border/70 bg-background/80 px-4 backdrop-blur-xl sm:px-6 lg:px-8">
      <div className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between">
        <Link href={ROUTES.HOME} className="flex items-center rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <InnoPeakLogo className="h-8 w-auto" />
        </Link>

        <nav className="hidden items-center gap-1 lg:flex" aria-label={t("ariaLabel")}>
          {NAV_ITEMS.map((item) => (
            <Button key={item.key} asChild variant="ghost" size="sm">
              <Link href={item.href as Route}>{t(item.key)}</Link>
            </Button>
          ))}
        </nav>

        {/* `gap-1` below `sm`: German's longer labels leave the row short of fitting at ~360px, so `Sign in` is also
            hidden there (`getStarted` leads to a signup screen with its own sign-in link). Both labels reserve the
            widest locale's width (`StableWidthLabel`) so the switches do not move when the locale changes. */}
        <div className="flex items-center gap-1 sm:gap-2">
          <LanguageSwitcher compact />
          <ThemeToggle compact />
          <Button asChild variant="ghost" size="sm" className="hidden sm:inline-flex">
            <Link href={ROUTES.LOGIN}>
              <StableWidthLabel labels={actionLabels.signIn} activeLocale={activeLocale} />
            </Link>
          </Button>
          <Button asChild size="sm">
            <Link href={ROUTES.ONBOARDING_SIGNUP}>
              <StableWidthLabel labels={actionLabels.getStarted} activeLocale={activeLocale} />
            </Link>
          </Button>
        </div>
      </div>
    </header>
  );
}

/** Each action label in every locale, from the same messages JSON, so `StableWidthLabel` can reserve the widest. */
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
 * Shows the active label while reserving the widest locale's width: German "Anmelden"/"Jetzt starten" otherwise shifted
 * the right-aligned cluster, sliding `LanguageSwitcher` out from under the cursor. `invisible` (not `hidden`/`sr-only`)
 * keeps the box in layout but out of the accessibility tree, so the accessible name stays the active label.
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
