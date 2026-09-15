"use client";

import { useTranslations } from "next-intl";
import { LuRefreshCw, LuTriangleAlert } from "react-icons/lu";

import { Button } from "@/components/ui/button";

interface LoadErrorStateProps {
  /** Retries the failed query. Omit for a screen with nothing meaningful to retry. */
  onRetry?: () => void;
}

/**
 * Shown when a query **failed**, in place of the screen's empty state.
 *
 * Every admin hook used to collapse an error into `?? []`, so a failed request rendered exactly
 * like a successful one that returned nothing: an outage read as "No businesses yet — New
 * businesses will show up here once they sign up." A super admin could not tell a broken platform
 * from an empty one, and the only signal was a toast that had already faded.
 *
 * Queries here run with `retry: false`, so nothing recovers on its own — hence an explicit retry
 * rather than just a message.
 */
export function LoadErrorState({ onRetry }: LoadErrorStateProps) {
  const t = useTranslations("common.loadError");

  return (
    <div className="border-border bg-card shadow-elevated flex flex-col items-center justify-center gap-2 rounded-xl border px-6 py-12 text-center">
      <LuTriangleAlert className="text-destructive size-7" />
      <p className="text-sm font-medium">{t("title")}</p>
      <p className="text-muted-foreground text-[13px]">{t("description")}</p>
      {onRetry ? (
        <Button type="button" variant="outline" className="mt-2" onClick={onRetry}>
          <LuRefreshCw className="size-4" />
          {t("retry")}
        </Button>
      ) : null}
    </div>
  );
}
