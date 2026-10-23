"use client";

import * as Sentry from "@sentry/nextjs";
import { useTranslations } from "next-intl";
import { useEffect } from "react";

import { LoadErrorState } from "@/components/common/load-error-state";

interface RouteErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

/**
 * The body of an `error.tsx`: a render error inside one route group is caught here, so the layout around it (the shell, its navigation and
 * sign-out) stays on screen. Without a boundary the error climbed to `global-error` and replaced the whole page, shell included.
 */
export function RouteError({ error, reset }: RouteErrorProps) {
  const t = useTranslations("common.routeError");

  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <div className="p-fluid-page">
      <LoadErrorState onRetry={reset} />
      {error.digest ? (
        <p className="text-muted-foreground mt-3 text-center font-mono text-xs">
          {t("reference", { digest: error.digest })}
        </p>
      ) : null}
    </div>
  );
}
