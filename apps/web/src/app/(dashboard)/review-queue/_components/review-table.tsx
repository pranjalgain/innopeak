"use client";

import type { Route } from "next";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

import { ROUTES } from "@/app/_libs/constants/routes";
import { ClassificationBadge } from "@/components/common/classification-badge";
import { ReviewStatusBadge } from "@/components/common/review-status-badge";
import { StarRating } from "@/components/common/star-rating";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { Review } from "@/types/domain";

interface ReviewTableProps {
  reviews: Review[];
}

const DATE_FORMATTER = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });

/**
 * Tablet/desktop layout — a horizontally-scrollable fixed-width table
 * (matches the design's own `min-width:760px` on this breakpoint rather
 * than letting columns shrink/overlap). Below the tablet breakpoint,
 * `ReviewCardList` takes over instead (see `review-results.tsx`).
 */
export function ReviewTable({ reviews }: ReviewTableProps) {
  const t = useTranslations("reviewQueue");
  const tEscalation = useTranslations("common.escalationReason");
  const router = useRouter();

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card shadow-elevated">
      <Table className="min-w-[820px] table-fixed">
        <TableHeader>
          <TableRow className="bg-muted/55 hover:bg-muted/55">
            <TableHead className="w-40">{t("columns.reviewer")}</TableHead>
            <TableHead className="w-28">{t("columns.rating")}</TableHead>
            <TableHead>{t("columns.review")}</TableHead>
            <TableHead className="w-48">{t("columns.classification")}</TableHead>
            <TableHead className="w-32">{t("columns.status")}</TableHead>
            <TableHead className="w-24">{t("columns.date")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {reviews.map((review, index) => (
            <TableRow
              key={review.id}
              onClick={() => router.push(ROUTES.REVIEW_DETAIL(review.id) as Route)}
              className="animate-in fade-in slide-in-from-bottom-1 fill-mode-backwards cursor-pointer duration-300 ease-fluid"
              style={{ animationDelay: `${Math.min(index, 8) * 40}ms` }}
            >
              <TableCell className="w-40 truncate font-medium">{review.reviewerName}</TableCell>
              <TableCell className="w-28">
                <StarRating rating={review.rating} />
              </TableCell>
              <TableCell className="truncate text-muted-foreground">{review.reviewText}</TableCell>
              <TableCell className="w-48 whitespace-normal">
                <div className="flex flex-col items-start gap-1">
                  <ClassificationBadge classification={review.classification} />
                  {review.escalationReason ? (
                    <span className="inline-flex items-center gap-1 rounded-md border border-warning px-2.5 py-0.5 text-xs font-medium whitespace-nowrap text-warning">
                      {tEscalation(review.escalationReason)}
                    </span>
                  ) : null}
                </div>
              </TableCell>
              <TableCell className="w-32">
                <ReviewStatusBadge status={review.status} />
              </TableCell>
              <TableCell className="w-24 text-muted-foreground">
                {DATE_FORMATTER.format(new Date(review.reviewedAt))}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
