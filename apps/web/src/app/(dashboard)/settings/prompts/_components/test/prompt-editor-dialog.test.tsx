import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, test, vi } from "vitest";

import type { AiPrompt } from "@/types/domain";

import messages from "../../../../../../../messages/en.json";
import { PromptEditorDialog } from "../prompt-editor-dialog";

const TEMPLATE = "Reply to {{reviewer_name}} about {{business_name}}: {{rating}} stars. {{review_text}}";

const prompt: AiPrompt = {
  id: "p1",
  name: "Positive reply",
  description: "d",
  tone: "friendly",
  versions: [{ version: 1, template: TEMPLATE, updatedAt: "2026-10-01T10:00:00.000Z", updatedByName: "Jane" }],
} as AiPrompt;

function renderEditor(onSaveVersion: (id: string, template: string) => Promise<boolean>) {
  const onClose = vi.fn();
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <PromptEditorDialog prompt={prompt} isSaving={false} onSaveVersion={onSaveVersion} onClose={onClose} />
    </NextIntlClientProvider>,
  );
  fireEvent.change(screen.getByRole("textbox"), { target: { value: `${TEMPLATE} Thank you!` } });
  fireEvent.click(screen.getByRole("button", { name: /Save as v2/ }));
  return onClose;
}

describe("PromptEditorDialog", () => {
  // A rejected save used to close the dialog anyway, losing up to 1000 characters of edits.
  test("stays open when the save fails", async () => {
    const save = vi.fn().mockResolvedValue(false);
    const onClose = renderEditor(save);

    await waitFor(() => expect(save).toHaveBeenCalledOnce());

    expect(onClose).not.toHaveBeenCalled();
  });

  test("closes once the save succeeds", async () => {
    const onClose = renderEditor(vi.fn().mockResolvedValue(true));

    await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
  });
});
