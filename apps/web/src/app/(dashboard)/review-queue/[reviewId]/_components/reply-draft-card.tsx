"use client";

import { useTranslations } from "next-intl";
import * as React from "react";
import { LuCheck, LuInfo, LuPencil, LuX } from "react-icons/lu";

import { cn } from "@/app/_libs/utils/cn";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import type { ReviewReplyDraft } from "@/types/domain";

interface ReplyDraftCardProps {
  draft: ReviewReplyDraft;
  onApprove: (id: string, content: string) => void;
  onReject: (id: string) => void;
}

const STATUS_BADGE_CLASSNAME: Record<ReviewReplyDraft["status"], string> = {
  pending_approval: "bg-accent text-primary",
  approved: "bg-success-soft text-success",
  rejected: "bg-destructive-soft text-destructive",
  superseded: "bg-muted text-muted-foreground",
};

const CONFIRMATION_CLASSNAME: Partial<Record<ReviewReplyDraft["status"], string>> = {
  approved: "bg-success-soft text-success",
  rejected: "bg-destructive-soft text-destructive",
  superseded: "bg-muted text-muted-foreground",
};

const CONFIRMATION_ICON: Partial<Record<ReviewReplyDraft["status"], React.ComponentType<{ className?: string }>>> = {
  approved: LuCheck,
  rejected: LuX,
  superseded: LuInfo,
};

export function ReplyDraftCard({ draft, onApprove, onReject }: ReplyDraftCardProps) {
  const t = useTranslations("reviewDetail.replies");
  const tStatus = useTranslations("reviewDetail.replies.status");
  const [isEditing, setIsEditing] = React.useState(false);
  const [text, setText] = React.useState(draft.content);

  const isDecided = draft.status !== "pending_approval";
  const ConfirmationIcon = CONFIRMATION_ICON[draft.status];

  const handleCancelEdit = () => {
    setText(draft.content);
    setIsEditing(false);
  };

  return (
    <Card className={cn("h-full", draft.status === "superseded" && "opacity-55")}>
      <CardContent className="flex h-full flex-col gap-3">
        <div className="flex items-center justify-between">
          <span className="text-[13px] font-semibold text-muted-foreground">
            {t("snippetLabel", { label: draft.label })}
          </span>
          <span
            className={cn(
              "inline-flex items-center rounded-md px-2.5 py-0.5 text-xs font-medium",
              STATUS_BADGE_CLASSNAME[draft.status],
            )}
          >
            {tStatus(draft.status)}
          </span>
        </div>

        <Textarea
          value={text}
          onChange={(event) => setText(event.target.value)}
          readOnly={isDecided || !isEditing}
          disabled={isDecided}
          rows={5}
          className={cn("flex-1", !isDecided && isEditing && "border-ring ring-[3px] ring-ring/35")}
        />

        {isDecided ? (
          <div
            className={cn(
              "animate-in fade-in zoom-in-95 flex items-center gap-2 rounded-md px-3 py-2.5 text-[13px] font-medium duration-300 ease-fluid",
              CONFIRMATION_CLASSNAME[draft.status],
            )}
          >
            {ConfirmationIcon ? <ConfirmationIcon className="size-4 shrink-0" /> : null}
            {t(`confirmation.${draft.status}`)}
          </div>
        ) : (
          <div className="animate-in fade-in flex flex-wrap gap-2 duration-200 ease-fluid">
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
            <Button type="button" size="sm" variant="destructive" onClick={() => onReject(draft.id)}>
              <LuX />
              {t("reject")}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
