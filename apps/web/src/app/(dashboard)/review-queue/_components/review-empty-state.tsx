import { useTranslations } from "next-intl";
import { LuSearch } from "react-icons/lu";

import { EmptyState } from "@/components/common/empty-state";

interface ReviewEmptyStateProps {
  onClearFilters: () => void;
}

export function ReviewEmptyState({ onClearFilters }: ReviewEmptyStateProps) {
  const t = useTranslations("reviewQueue.emptyState");

  return (
    <EmptyState
      icon={LuSearch}
      title={t("title")}
      description={t("description")}
      action={{ label: t("clearFilters"), onClick: onClearFilters }}
    />
  );
}
