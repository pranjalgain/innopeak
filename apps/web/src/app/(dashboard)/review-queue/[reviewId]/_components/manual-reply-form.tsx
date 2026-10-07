"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";

import { LuLoaderCircle, LuSend } from "react-icons/lu";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";

/** Mirrors `CreateManualReplyDto`'s `@MaxLength(4096)`. */
const MAX_REPLY_LENGTH = 4096;

interface ManualReplyFormProps {
  /** Resolves `true` when the reply was saved, so the form knows to clear itself. */
  onSubmit: (content: string) => Promise<boolean>;
  isSubmitting: boolean;
}

export function ManualReplyForm({ onSubmit, isSubmitting }: ManualReplyFormProps) {
  const t = useTranslations("reviewDetail.replies.manual");
  const [text, setText] = useState("");

  const content = text.trim();
  const canSubmit = content.length > 0 && !isSubmitting;

  const handleSubmit = async () => {
    if (await onSubmit(content)) setText("");
  };

  return (
    <Card>
      <CardContent className="flex flex-col gap-3">
        <div>
          <h3 className="text-sm font-semibold">{t("title")}</h3>
          <p className="text-muted-foreground text-[13px]">{t("description")}</p>
        </div>
        <Textarea
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder={t("placeholder")}
          maxLength={MAX_REPLY_LENGTH}
          rows={4}
        />
        <div>
          <Button type="button" size="sm" disabled={!canSubmit} onClick={handleSubmit}>
            {isSubmitting ? <LuLoaderCircle className="animate-spin" /> : <LuSend />}
            {isSubmitting ? t("submitting") : t("submit")}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
