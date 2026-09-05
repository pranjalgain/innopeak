"use client";

import { useTranslations } from "next-intl";
import { LuChevronLeft, LuChevronRight } from "react-icons/lu";

import { Button } from "@/components/ui/button";

interface PaginationProps {
  page: number;
  totalPages: number;
  onPrevious: () => void;
  onNext: () => void;
}

export function Pagination({ page, totalPages, onPrevious, onNext }: PaginationProps) {
  const t = useTranslations("common.pagination");

  if (totalPages <= 1) return null;

  return (
    <div className="flex items-center justify-end gap-3">
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={onPrevious}
        disabled={page <= 1}
        aria-label={t("previous")}
      >
        <LuChevronLeft />
      </Button>
      <p className="text-sm text-muted-foreground">{t("pageOf", { page, totalPages })}</p>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={onNext}
        disabled={page >= totalPages}
        aria-label={t("next")}
      >
        <LuChevronRight />
      </Button>
    </div>
  );
}
