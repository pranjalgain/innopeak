import { useTranslations } from "next-intl";
import { LuSearch } from "react-icons/lu";

import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { ReviewClassification, ReviewQueueFilters, ReviewStatus } from "@/types/domain";

interface ReviewFiltersBarProps {
  filters: ReviewQueueFilters;
  onStatusChange: (status: ReviewQueueFilters["status"]) => void;
  onClassificationChange: (classification: ReviewQueueFilters["classification"]) => void;
  onSearchChange: (search: string) => void;
}

const STATUS_VALUES: ReviewStatus[] = ["new", "in_review", "responded", "dismissed"];
const CLASSIFICATION_VALUES: ReviewClassification[] = ["auto_reply_candidate", "escalated"];

export function ReviewFiltersBar({
  filters,
  onStatusChange,
  onClassificationChange,
  onSearchChange,
}: ReviewFiltersBarProps) {
  const t = useTranslations("reviewQueue.filters");
  const tStatus = useTranslations("common.reviewStatus");
  const tClassification = useTranslations("common.classification");

  return (
    <div className="flex flex-col gap-2.5 rounded-xl border border-border bg-card p-3.5 shadow-elevated md:flex-row md:flex-wrap md:items-center">
      {/* Mobile: search comes first, full width. Desktop/tablet: pushed to the end via md:order. */}
      <div className="relative w-full md:order-2 md:ml-auto md:min-w-[200px] md:max-w-[280px] md:flex-1">
        <LuSearch className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="text"
          placeholder={t("searchPlaceholder")}
          value={filters.search}
          onChange={(event) => onSearchChange(event.target.value)}
          className="h-9 pl-8 text-[13px] md:h-8.5"
        />
      </div>

      <div className="flex gap-2.5 md:contents">
        <Select
          value={filters.status}
          onValueChange={(value) => onStatusChange(value as ReviewQueueFilters["status"])}
        >
          <SelectTrigger size="sm" className="flex-1 md:w-fit md:flex-none">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("allStatuses")}</SelectItem>
            {STATUS_VALUES.map((status) => (
              <SelectItem key={status} value={status}>
                {tStatus(status)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={filters.classification}
          onValueChange={(value) => onClassificationChange(value as ReviewQueueFilters["classification"])}
        >
          <SelectTrigger size="sm" className="flex-1 md:w-fit md:flex-none">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("allClassifications")}</SelectItem>
            {CLASSIFICATION_VALUES.map((classification) => (
              <SelectItem key={classification} value={classification}>
                {tClassification(classification)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
