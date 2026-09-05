"use client";

import { useTranslations } from "next-intl";
import * as React from "react";

import { getCurrentVersion } from "@/app/_libs/utils/prompt";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import type { AiPrompt } from "@/types/domain";

interface PromptEditorDialogProps {
  prompt: AiPrompt | null;
  isSaving: boolean;
  onSaveVersion: (id: string, template: string) => Promise<void>;
  onClose: () => void;
}

export function PromptEditorDialog({ prompt, isSaving, onSaveVersion, onClose }: PromptEditorDialogProps) {
  const t = useTranslations("promptManagement.editor");
  const currentTemplate = prompt ? getCurrentVersion(prompt).template : "";
  const [template, setTemplate] = React.useState(currentTemplate);

  React.useEffect(() => {
    setTemplate(currentTemplate);
  }, [currentTemplate]);

  const nextVersion = prompt ? prompt.versions.length + 1 : 1;
  const hasChanged = template.trim() !== currentTemplate.trim();

  return (
    <Dialog open={prompt !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{prompt?.name}</DialogTitle>
          <DialogDescription>{t("description", { version: nextVersion })}</DialogDescription>
        </DialogHeader>

        <Textarea
          value={template}
          onChange={(event) => setTemplate(event.target.value)}
          rows={12}
          className="font-mono text-xs"
        />

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose} disabled={isSaving}>
            {t("cancel")}
          </Button>
          <Button
            type="button"
            disabled={isSaving || template.trim() === "" || !hasChanged}
            onClick={async () => {
              if (!prompt) return;
              await onSaveVersion(prompt.id, template);
              onClose();
            }}
          >
            {isSaving ? t("saving") : t("saveAsNewVersion", { version: nextVersion })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
