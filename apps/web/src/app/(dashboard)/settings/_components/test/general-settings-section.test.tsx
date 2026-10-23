import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, test, vi } from "vitest";

import messages from "../../../../../../messages/en.json";
import { GeneralSettingsSection } from "../general-settings-section";

const general = {
  escalationRatingThreshold: 3,
  autoPostApprovedReplies: false,
  reviewDataRetentionMonths: 6,
  aiReplyCount: 3,
} as const;

function renderSection(onSave = vi.fn().mockResolvedValue(true)) {
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <GeneralSettingsSection general={{ ...general }} onSave={onSave} />
    </NextIntlClientProvider>,
  );
}

describe("GeneralSettingsSection — retention unit", () => {
  // "1 months, then…" read as a typo.
  test.each([
    ["1", messages.settings.general.retention.suffixOne],
    ["6", messages.settings.general.retention.suffixOther],
  ])("names the unit for %s", (value, expected) => {
    renderSection();

    fireEvent.change(screen.getByLabelText(messages.settings.general.retention.label), { target: { value } });

    expect(screen.getByText(expected)).toBeInTheDocument();
  });

  test("names the controls that had no name", () => {
    renderSection();

    expect(screen.getByRole("slider", { name: messages.settings.general.escalationThreshold.label })).toBeInTheDocument();
    expect(screen.getByRole("switch", { name: messages.settings.general.autoPost.label })).toBeInTheDocument();
  });
});

describe("GeneralSettingsSection — what it saves", () => {
  // Its draft is taken at mount and now outlives visits to the AI tab, so it must not send the AI reply count back.
  test("sends only the fields this tab edits", async () => {
    const onSave = vi.fn().mockResolvedValue(true);
    renderSection(onSave);

    fireEvent.click(screen.getByRole("switch", { name: messages.settings.general.autoPost.label }));
    fireEvent.click(screen.getByRole("button", { name: messages.settings.general.save }));

    await waitFor(() => expect(onSave).toHaveBeenCalledOnce());
    expect(onSave).toHaveBeenCalledWith({
      escalationRatingThreshold: 3,
      autoPostApprovedReplies: true,
      reviewDataRetentionMonths: 6,
    });
  });
});
