"use client";

import { useTranslations } from "next-intl";
import { LuRefreshCw, LuTriangleAlert } from "react-icons/lu";

import { Button } from "@/components/ui/button";

interface LoadErrorStateProps {
  onRetry?: () => void;
}

/**
 * For a failed query, in place of the empty state: an outage must not read as "nothing yet".
 * Queries run with `retry: false`, hence the explicit retry.
 */
export function LoadErrorState({ onRetry }: LoadErrorStateProps) {
  const t = useTranslations("common.loadError");

  return (
    <div role="alert" className="border-border bg-card shadow-elevated flex flex-col items-center justify-center gap-2 rounded-xl border px-6 py-12 text-center">
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
