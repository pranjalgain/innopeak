"use client";

import type { Route } from "next";
import { useRouter } from "next/navigation";
import { useFormatter, useTranslations } from "next-intl";

import { ROUTES } from "@/app/_libs/constants/routes";
import { ClassificationBadge } from "@/components/common/classification-badge";
import { ReviewStatusBadge } from "@/components/common/review-status-badge";
import { StarRating } from "@/components/common/star-rating";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { Review } from "@/types/domain";

interface ReviewTableProps {
  reviews: Review[];
}

const DATE_FORMAT = { month: "short", day: "numeric" } as const;

/** Tablet/desktop layout: a horizontally scrollable fixed-width table (design's `min-width:760px`); `ReviewCardList` takes over below the tablet breakpoint. */
export function ReviewTable({ reviews }: ReviewTableProps) {
  const t = useTranslations("reviewQueue");
  const format = useFormatter();
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
            <TableHead className="w-56 text-center">{t("columns.classification")}</TableHead>
            <TableHead className="w-32 text-center">{t("columns.status")}</TableHead>
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
              {/* Wraps rather than truncates: German classification labels (`auto_reply_candidate` alone is 34
                  characters) would spill into "Status" under `table-fixed`, and classification is meant to be read.
                  `min-w-0` on the flex column plus `max-w-full` on each badge lets wrapping engage; `Badge`'s own
                  `w-fit` otherwise wins. */}
              <TableCell className="w-56 whitespace-normal">
                <div className="flex min-w-0 flex-col items-center gap-1 text-center">
                  <ClassificationBadge
                    classification={review.classification}
                    className="max-w-full whitespace-normal break-words text-center"
                  />
                  {review.escalationReason ? (
                    <span
                      className="inline-flex max-w-full items-center gap-1 rounded-md border border-warning px-2.5 py-0.5 text-xs font-medium break-words whitespace-normal text-center text-warning"
                    >
                      {tEscalation(review.escalationReason)}
                    </span>
                  ) : null}
                </div>
              </TableCell>
              <TableCell className="w-32 whitespace-normal text-center">
                <ReviewStatusBadge
                  status={review.status}
                  className="max-w-full whitespace-normal break-words text-center"
                />
              </TableCell>
              <TableCell className="w-24 text-muted-foreground">
                {format.dateTime(new Date(review.reviewedAt), DATE_FORMAT)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
