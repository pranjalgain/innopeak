import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, test } from "vitest";

import type { AttentionReview } from "@/types/domain";

import messages from "../../../../../../messages/en.json";
import { AttentionReviewsGrid } from "../attention-reviews-grid";

const review = (overrides: Partial<AttentionReview>): AttentionReview => ({
  id: "r1",
  reviewerName: "Babla Gain",
  initials: "BG",
  rating: 4,
  snippet: "Good food.",
  escalationReason: "low_rating",
  ...overrides,
});

function renderGrid(reviews: AttentionReview[]) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <AttentionReviewsGrid reviews={reviews} />
    </NextIntlClientProvider>,
  );
}

describe("AttentionReviewsGrid", () => {
  // jsdom has no layout, so this guards the classes that do the work: the card's content fills the card and the footer is pushed to
  // the bottom, whatever the length of the review text above it.
  test("pins the badge and button row to the bottom of every card", () => {
    renderGrid([
      review({ id: "short", snippet: "Good." }),
      review({ id: "long", snippet: "A much longer review ".repeat(20) }),
    ]);

    for (const link of screen.getAllByRole("link", { name: /review/i })) {
      const footer = link.parentElement;
      const content = footer?.parentElement;
      expect(footer).toHaveClass("mt-auto");
      expect(content).toHaveClass("flex-1", "flex-col");
    }
  });

  test("renders nothing when no review needs attention", () => {
    const { container } = renderGrid([]);

    expect(container).toBeEmptyDOMElement();
  });
});
