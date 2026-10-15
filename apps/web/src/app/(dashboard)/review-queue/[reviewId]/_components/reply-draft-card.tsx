"use client";

import { useTranslations } from "next-intl";
import { type ComponentType, useState } from "react";

import {
  LuCheck,
  LuCircleAlert,
  LuInfo,
  LuLoaderCircle,
  LuPencil,
  LuRotateCw,
  LuSend,
  LuX,
} from "react-icons/lu";

import { cn } from "@/app/_libs/utils/cn";
import { getReplyDeliveryState } from "@/app/_libs/utils/reply-delivery";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";

import type { ReviewReplyDraft } from "@/types/domain";

interface ReplyDraftCardProps {
  draft: ReviewReplyDraft;
  onApprove: (id: string, content: string) => void;
  onReject: (id: string) => void;
  onPost: (id: string) => void;
  onRetry: (id: string) => void;
  /** A Post/Retry click is in flight or its job has not reported back yet. */
  isPosting: boolean;
  /** The approve/reject request has not returned: the optimistic state says approved, but posting would be refused. */
  isDeciding?: boolean;
  /** False when another reply is already live, so retrying a failed one could only end in a 409. */
  canRetry?: boolean;
  /** The review was deleted on Google: the card shows what happened but offers nothing to do. */
  reviewRemoved?: boolean;
}

/** What the card shows — the draft's own status, except that an approved one splits by delivery. */
type DisplayStatus = ReviewReplyDraft["status"] | "posted" | "post_failed" | "imported";

const STATUS_BADGE_CLASSNAME: Record<DisplayStatus, string> = {
  pending_approval: "bg-accent text-primary",
  imported: "bg-muted text-muted-foreground",
  approved: "bg-success-soft text-success",
  posted: "bg-success-soft text-success",
  post_failed: "bg-destructive-soft text-destructive",
  rejected: "bg-destructive-soft text-destructive",
  superseded: "bg-muted text-muted-foreground",
};

const CONFIRMATION_CLASSNAME: Partial<Record<DisplayStatus, string>> = {
  imported: "bg-muted text-muted-foreground",
  approved: "bg-success-soft text-success",
  posted: "bg-success-soft text-success",
  post_failed: "bg-destructive-soft text-destructive",
  rejected: "bg-destructive-soft text-destructive",
  superseded: "bg-muted text-muted-foreground",
};

const CONFIRMATION_ICON: Partial<
  Record<DisplayStatus, ComponentType<{ className?: string }>>
> = {
  imported: LuInfo,
  approved: LuCheck,
  posted: LuCheck,
  post_failed: LuCircleAlert,
  rejected: LuX,
  superseded: LuInfo,
};

export function ReplyDraftCard({
  draft,
  onApprove,
  onReject,
  onPost,
  onRetry,
  isPosting,
  isDeciding = false,
  canRetry = true,
  reviewRemoved = false,
}: ReplyDraftCardProps) {
  const t = useTranslations("reviewDetail.replies");
  const tStatus = useTranslations("reviewDetail.replies.status");
  const [isEditing, setIsEditing] = useState(false);
  const [text, setText] = useState(draft.content);

  const isDecided = draft.status !== "pending_approval";
  const delivery = getReplyDeliveryState(draft);
  // A reply someone wrote on Google itself, picked up by sync: it was never sent from this app, so it must not claim "Posted to your
  // Google Business Profile" (that is what a reply approved here says). Its own status, and no Post/Retry controls (`delivery` is
  // already "posted").
  const isImported = draft.source === "imported";
  const displayStatus: DisplayStatus = isImported
    ? "imported"
    : delivery === "posted"
      ? "posted"
      : delivery === "failed"
        ? "post_failed"
        : draft.status;
  const ConfirmationIcon = CONFIRMATION_ICON[displayStatus];

  const handleCancelEdit = () => {
    setText(draft.content);
    setIsEditing(false);
  };

  return (
    <Card className={cn("h-full shadow-none", draft.status === "superseded" && "opacity-55")}>
      <CardContent className="flex h-full flex-col gap-3">
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground text-[13px] font-semibold">
            {isImported ? t("importedLabel") : t("snippetLabel", { label: draft.label })}
          </span>
          <span
            className={cn(
              "inline-flex items-center rounded-md px-2.5 py-0.5 text-xs font-medium",
              STATUS_BADGE_CLASSNAME[displayStatus],
            )}>
            {tStatus(displayStatus)}
          </span>
        </div>

        <Textarea
          value={text}
          onChange={(event) => setText(event.target.value)}
          readOnly={isDecided || !isEditing}
          disabled={isDecided}
          rows={5}
          className={cn("flex-1", !isDecided && isEditing && "border-ring ring-ring/35 ring-[3px]")}
        />

        {isDecided ? (
          <div className="flex flex-col gap-2">
            <div
              className={cn(
                "animate-in fade-in zoom-in-95 ease-fluid flex items-center gap-2 rounded-md px-3 py-2.5 text-[13px] font-medium duration-300",
                CONFIRMATION_CLASSNAME[displayStatus],
              )}>
              {ConfirmationIcon ? <ConfirmationIcon className="size-4 shrink-0" /> : null}
              {t(`confirmation.${displayStatus}`)}
            </div>
            {delivery === "failed" && draft.errorMessage ? (
              <p className="text-muted-foreground text-xs break-words">
                {t("postErrorDetail", { message: draft.errorMessage })}
              </p>
            ) : null}
            {delivery === "failed" && !canRetry && !reviewRemoved ? (
              <p className="text-muted-foreground text-xs">{t("retryUnavailable")}</p>
            ) : null}
            {!reviewRemoved && (delivery === "not_posted" || (delivery === "failed" && canRetry)) ? (
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant={delivery === "failed" ? "outline" : "default"}
                  disabled={isPosting || isDeciding}
                  onClick={() => (delivery === "failed" ? onRetry(draft.id) : onPost(draft.id))}>
                  {isPosting ? (
                    <LuLoaderCircle className="animate-spin" />
                  ) : delivery === "failed" ? (
                    <LuRotateCw />
                  ) : (
                    <LuSend />
                  )}
                  {isPosting ? t("posting") : delivery === "failed" ? t("retryPost") : t("post")}
                </Button>
              </div>
            ) : null}
          </div>
        ) : reviewRemoved ? null : (
          <div className="animate-in fade-in ease-fluid flex flex-wrap gap-2 duration-200">
            <Button type="button" size="sm" onClick={() => onApprove(draft.id, text)}>
              <LuCheck />
              {t("approve")}
            </Button>
            {isEditing ? (
              <Button type="button" size="sm" variant="outline" onClick={handleCancelEdit}>
                <LuX />
                {t("cancelEdit")}
              </Button>
            ) : (
              <Button type="button" size="sm" variant="outline" onClick={() => setIsEditing(true)}>
                <LuPencil />
                {t("edit")}
              </Button>
            )}
            <Button
              type="button"
              size="sm"
              variant="destructive"
              onClick={() => onReject(draft.id)}>
              <LuX />
              {t("reject")}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
