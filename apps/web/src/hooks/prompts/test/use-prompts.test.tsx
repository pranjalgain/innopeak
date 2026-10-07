
import { QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ReactNode } from "react";
import { describe, expect, test, vi } from "vitest";

import { PromptService } from "@/app/_libs/services/prompt.service";
import { createQueryClient } from "@/app/_libs/utils/query-client";
import type { AiPrompt } from "@/types/domain";

import messages from "../../../../messages/en.json";
import { usePrompts } from "../use-prompts";

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

function prompt(overrides: Partial<AiPrompt> = {}): AiPrompt {
  return {
    id: "prompt-1",
    name: "Review reply",
    description: "Drafts a reply to an incoming review.",
    tone: "friendly",
    versions: [{ version: 1, template: "Thanks for the review!", updatedAt: "2026-01-01T00:00:00.000Z", updatedByName: "InnoPeak default" }],
    ...overrides,
  };
}

// Fresh QueryClient per render so cached `["prompts"]` data cannot leak across tests.
function wrapper({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={createQueryClient()}>
      <NextIntlClientProvider locale="en" messages={messages}>
        {children}
      </NextIntlClientProvider>
    </QueryClientProvider>
  );
}

describe("usePrompts", () => {
  test("saveNewVersion resolves rather than rejecting when the save fails", async () => {
    // Regression: `mutateAsync` rejects even after `onError` fires; uncaught,
    // `PromptEditorDialog`'s `await onSaveVersion(...); onClose()` would throw as an unhandled
    // rejection.
    vi.spyOn(PromptService, "getPrompts").mockResolvedValue([prompt()]);
    vi.spyOn(PromptService, "createVersion").mockRejectedValue(new Error("network error"));

    const { result } = renderHook(() => usePrompts(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await expect(result.current.saveNewVersion("prompt-1", "New template")).resolves.toBeUndefined();
    });
  });

  test("updateTone resolves rather than rejecting when the save fails", async () => {
    // Regression: `prompt-tone-select.tsx` fires this without awaiting, so a rejection would be
    // unhandled.
    vi.spyOn(PromptService, "getPrompts").mockResolvedValue([prompt()]);
    vi.spyOn(PromptService, "updateTone").mockRejectedValue(new Error("network error"));

    const { result } = renderHook(() => usePrompts(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await expect(result.current.updateTone("prompt-1", "formal")).resolves.toBeUndefined();
    });
  });

  test("saveNewVersion still applies the update on success", async () => {
    const original = prompt();
    const updated: AiPrompt = {
      ...original,
      versions: [
        ...original.versions,
        { version: 2, template: "New template", updatedAt: "2026-01-02T00:00:00.000Z", updatedByName: "Owner" },
      ],
    };
    vi.spyOn(PromptService, "getPrompts").mockResolvedValue([original]);
    vi.spyOn(PromptService, "createVersion").mockResolvedValue(updated);

    const { result } = renderHook(() => usePrompts(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.saveNewVersion("prompt-1", "New template");
    });

    await waitFor(() => expect(result.current.prompts[0]?.versions).toHaveLength(2));
  });
});
