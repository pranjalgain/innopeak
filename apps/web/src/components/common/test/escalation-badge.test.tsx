import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, test } from "vitest";

import messages from "../../../../messages/en.json";
import { EscalationBadge } from "../escalation-badge";

function renderBadge(wrap: boolean) {
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <EscalationBadge reason="low_rating" wrap={wrap} />
    </NextIntlClientProvider>,
  );
  return screen.getByText(messages.common.escalationReason.low_rating);
}

// `truncate` and a wrapping whitespace class do not merge away, so the wrap case must not carry `truncate` at all.
describe("EscalationBadge", () => {
  test("truncates by default", () => {
    expect(renderBadge(false).className).toContain("truncate");
  });

  test("wraps instead when asked, with no truncate left to fight it", () => {
    const badge = renderBadge(true);

    expect(badge.className).not.toContain("truncate");
    expect(badge.className).toContain("whitespace-normal");
  });
});
