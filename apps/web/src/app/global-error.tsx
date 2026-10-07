"use client";



import * as Sentry from "@sentry/nextjs";
import Link from "next/link";
import posthog from "posthog-js";
import { useEffect, useState } from "react";
import { LuHouse, LuRefreshCw, LuTriangleAlert } from "react-icons/lu";

import { Button } from "@/components/ui/button";
import { type AppLocale, DEFAULT_LOCALE, isSupportedLocale, LOCALE_COOKIE_NAME } from "@/i18n/locales";
import { env } from "env";

interface GlobalErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

/**
 * Replaces the root layout when it throws, so there is no `NextIntlClientProvider` and
 * `useTranslations` would throw. Uses a tiny dictionary keyed by the `NEXT_LOCALE` cookie read
 * client-side instead of the full i18n stack.
 */
const COPY: Record<AppLocale, {
  eyebrow: string;
  title: string;
  description: string;
  reference: (digest: string) => string;
  retry: string;
  returnHome: string;
}> = {
  en: {
    eyebrow: "Captured by Sentry + PostHog",
    title: "Something went wrong.",
    description:
      "The exception has been recorded with diagnostic context. You can retry the request or return to a safe page.",
    reference: (digest) => `Reference: ${digest}`,
    retry: "Try again",
    returnHome: "Return home",
  },
  de: {
    eyebrow: "Erfasst von Sentry + PostHog",
    title: "Etwas ist schiefgelaufen.",
    description:
      "Der Fehler wurde mit Diagnoseinformationen erfasst. Sie können die Anfrage wiederholen oder zu einer sicheren Seite zurückkehren.",
    reference: (digest) => `Referenz: ${digest}`,
    retry: "Erneut versuchen",
    returnHome: "Zur Startseite",
  },
};

function readLocaleCookie(): AppLocale {
  if (typeof document === "undefined") return DEFAULT_LOCALE;
  const match = document.cookie.match(new RegExp(`(?:^|; )${LOCALE_COOKIE_NAME}=([^;]*)`));
  const value = match?.[1] ? decodeURIComponent(match[1]) : undefined;
  return isSupportedLocale(value) ? value : DEFAULT_LOCALE;
}

export default function GlobalError({ error, reset }: GlobalErrorProps) {
  // Starts at the default and corrects after mount: reading `document.cookie` during render would
  // trip a hydration mismatch.
  const [locale, setLocale] = useState<AppLocale>(DEFAULT_LOCALE);
  const t = COPY[locale];

  useEffect(() => {
    setLocale(readLocaleCookie());
  }, []);

  useEffect(() => {
    console.error("global-error", error);
    Sentry.captureException(error);
    posthog.captureException(error, {
      environment: env.NEXT_PUBLIC_POSTHOG_ENVIRONMENT,
    });
  }, [error]);

  return (
    <html lang={locale}>
      <body className="bg-background text-foreground font-sans antialiased">
        <main className="relative flex min-h-dvh items-center justify-center overflow-hidden px-4 py-16">
          <div className="surface-grid pointer-events-none absolute inset-0 -z-20 opacity-70" />
          <div className="bg-destructive/10 pointer-events-none absolute top-1/2 left-1/2 -z-10 size-96 -translate-x-1/2 -translate-y-1/2 rounded-full blur-3xl" />
          <div className="w-full max-w-xl text-center">
            <div className="bg-card mx-auto flex size-20 items-center justify-center rounded-[1.5rem] border shadow-xl">
              <LuTriangleAlert className="text-destructive size-8" aria-hidden="true" />
            </div>
            <p className="text-muted-foreground mt-7 font-mono text-xs tracking-[0.2em] uppercase">
              {t.eyebrow}
            </p>
            <h1 className="mt-4 text-4xl font-semibold tracking-tight sm:text-5xl">
              {t.title}
            </h1>
            <p className="text-muted-foreground mx-auto mt-5 max-w-md text-lg leading-8">
              {t.description}
            </p>
            {error.digest && (
              <p className="bg-muted mt-5 inline-flex rounded-md px-2.5 py-1 font-mono text-xs">
                {t.reference(error.digest)}
              </p>
            )}
            <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
              <Button type="button" size="lg" onClick={reset}>
                <LuRefreshCw aria-hidden="true" />
                {t.retry}
              </Button>
              <Button asChild variant="outline" size="lg">
                <Link href="/">
                  <LuHouse aria-hidden="true" />
                  {t.returnHome}
                </Link>
              </Button>
            </div>
          </div>
        </main>
      </body>
    </html>
  );
}
