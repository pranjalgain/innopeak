"use client";



import * as Sentry from "@sentry/nextjs";
import Link from "next/link";
import posthog from "posthog-js";
import { useEffect } from "react";
import { LuHouse, LuRefreshCw, LuTriangleAlert } from "react-icons/lu";

import { Button } from "@/components/ui/button";
import { env } from "env";

interface GlobalErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function GlobalError({ error, reset }: GlobalErrorProps) {
  useEffect(() => {
    console.error("global-error", error);
    Sentry.captureException(error);
    posthog.captureException(error, {
      environment: env.NEXT_PUBLIC_POSTHOG_ENVIRONMENT,
    });
  }, [error]);

  return (
    <html lang="en">
      <body className="bg-background text-foreground font-sans antialiased">
        <main className="relative flex min-h-dvh items-center justify-center overflow-hidden px-4 py-16">
          <div className="surface-grid pointer-events-none absolute inset-0 -z-20 opacity-70" />
          <div className="bg-destructive/10 pointer-events-none absolute top-1/2 left-1/2 -z-10 size-96 -translate-x-1/2 -translate-y-1/2 rounded-full blur-3xl" />
          <div className="w-full max-w-xl text-center">
            <div className="bg-card mx-auto flex size-20 items-center justify-center rounded-[1.5rem] border shadow-xl">
              <LuTriangleAlert className="text-destructive size-8" aria-hidden="true" />
            </div>
            <p className="text-muted-foreground mt-7 font-mono text-xs tracking-[0.2em] uppercase">
              Captured by Sentry + PostHog
            </p>
            <h1 className="mt-4 text-4xl font-semibold tracking-tight sm:text-5xl">
              Something went wrong.
            </h1>
            <p className="text-muted-foreground mx-auto mt-5 max-w-md text-lg leading-8">
              The exception has been recorded with diagnostic context. You can retry the request or
              return to a safe page.
            </p>
            {error.digest && (
              <p className="bg-muted mt-5 inline-flex rounded-md px-2.5 py-1 font-mono text-xs">
                Reference: {error.digest}
              </p>
            )}
            <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
              <Button type="button" size="lg" onClick={reset}>
                <LuRefreshCw aria-hidden="true" />
                Try again
              </Button>
              <Button asChild variant="outline" size="lg">
                <Link href="/">
                  <LuHouse aria-hidden="true" />
                  Return home
                </Link>
              </Button>
            </div>
          </div>
        </main>
      </body>
    </html>
  );
}
