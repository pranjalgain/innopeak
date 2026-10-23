import { fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, test, vi } from "vitest";

import messages from "../../../../../../../messages/en.json";
import { PromptManagementView } from "../prompt-management-view";

const refetch = vi.fn();
vi.mock("@/hooks/prompts/use-prompts", () => ({
  usePrompts: () => ({
    prompts: [],
    isLoading: false,
    isError: true,
    refetch,
    isSaving: false,
    saveNewVersion: vi.fn(),
    updateTone: vi.fn(),
  }),
}));
vi.mock("@/hooks/prompts/use-prompt-analytics", () => ({
  usePromptAnalytics: () => ({ getStats: vi.fn(), isLoading: false }),
}));

describe("PromptManagementView", () => {
  // `retry: false` ends a failed load with no data and `isLoading` false: that used to render a blank list under a 2 s toast.
  test("offers a retry when the prompts fail to load, instead of a blank list", () => {
    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <PromptManagementView />
      </NextIntlClientProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: messages.common.loadError.retry }));

    expect(refetch).toHaveBeenCalledOnce();
  });
});
