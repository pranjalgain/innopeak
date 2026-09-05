"use client";

import { useTranslations } from "next-intl";
import { LuCheck, LuPencil, LuX } from "react-icons/lu";

import { getInitials } from "@/app/_libs/utils/initials";
import { StarRating } from "@/components/common/star-rating";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

/**
 * A static, illustrative rendering of the real Review Detail screen's
 * reviewer-card + AI-draft-approval pattern — built from the same
 * components the actual product uses, not a mocked-up screenshot, so it
 * never drifts from what the product really looks like. None of the
 * buttons do anything; this is marketing, not the app.
 */
export function ReviewReplyMockup() {
  const t = useTranslations("marketing.hero.mockup");

  return (
    <Card className="bg-card/95 overflow-hidden py-0 shadow-2xl backdrop-blur-xl">
      <CardContent className="flex flex-col gap-4 p-5 sm:p-6">
        <div className="flex items-start gap-3">
          <Avatar className="size-9 shrink-0">
            <AvatarFallback className="bg-accent text-xs font-medium text-accent-foreground">
              {getInitials(t("reviewerName"))}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-sm font-semibold">{t("reviewerName")}</span>
              <StarRating rating={2} />
            </div>
            <p className="mt-1.5 text-[13px] leading-5 text-muted-foreground">{t("reviewSnippet")}</p>
            <Badge
              variant="outline"
              className="mt-2 border-transparent bg-warning-soft text-xs font-medium text-warning"
            >
              {t("escalatedLabel")}
            </Badge>
          </div>
        </div>

        <div className="rounded-lg border border-border bg-muted/40 p-3.5">
          <p className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
            {t("draftLabel")}
          </p>
          <p className="mt-1.5 text-[13px] leading-5">{t("draftText")}</p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" tabIndex={-1} className="pointer-events-none">
            <LuCheck />
            {t("approve")}
          </Button>
          <Button type="button" size="sm" variant="outline" tabIndex={-1} className="pointer-events-none">
            <LuPencil />
            {t("edit")}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="destructive"
            tabIndex={-1}
            className="pointer-events-none"
          >
            <LuX />
            {t("reject")}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
