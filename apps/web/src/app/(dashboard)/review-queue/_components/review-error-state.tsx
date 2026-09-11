import { useTranslations } from "next-intl";
import { LuTriangleAlert } from "react-icons/lu";

import { Button } from "@/components/ui/button";

interface ReviewErrorStateProps {
  onRetry: () => void;
}

/**
 * Distinct from `ReviewEmptyState`: that one's "clear filters" copy is actively misleading when
 * the page/filter fetch never reached the server at all — this is what `ReviewResults` renders
 * instead of the empty state when `useReviewQueue().isError` is true.
 */
export function ReviewErrorState({ onRetry }: ReviewErrorStateProps) {
  const t = useTranslations("reviewQueue.errorState");

  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-border bg-card px-6 py-12 text-center shadow-elevated">
      <LuTriangleAlert className="text-warning size-7" />
      <p className="text-sm font-medium">{t("title")}</p>
      <p className="text-[13px] text-muted-foreground">{t("description")}</p>
      <Button type="button" variant="outline" size="sm" className="mt-2" onClick={onRetry}>
        {t("retry")}
      </Button>
    </div>
  );
}
