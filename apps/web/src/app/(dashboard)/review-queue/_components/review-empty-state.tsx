import { useTranslations } from "next-intl";
import { LuSearch } from "react-icons/lu";

import { Button } from "@/components/ui/button";

interface ReviewEmptyStateProps {
  onClearFilters: () => void;
}

export function ReviewEmptyState({ onClearFilters }: ReviewEmptyStateProps) {
  const t = useTranslations("reviewQueue.emptyState");

  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-border bg-card px-6 py-12 text-center shadow-elevated">
      <LuSearch className="size-7 text-muted-foreground" />
      <p className="text-sm font-medium">{t("title")}</p>
      <p className="text-[13px] text-muted-foreground">{t("description")}</p>
      <Button type="button" variant="outline" size="sm" className="mt-2" onClick={onClearFilters}>
        {t("clearFilters")}
      </Button>
    </div>
  );
}
