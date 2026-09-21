import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, test, vi } from "vitest";

import type { Review } from "@/types/domain";

import messages from "../../../../../../messages/en.json";
import { ReviewResults } from "../review-results";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

function review(overrides: Partial<Review> = {}): Review {
  return {
    id: "review-1",
    reviewerName: "Jamie",
    rating: 5,
    reviewText: "Loved it",
    reviewedAt: "2026-01-01T00:00:00.000Z",
    classification: null,
    escalationReason: null,
    status: "new",
    replyDrafts: [],
    ...overrides,
  };
}

function renderResults(props: Partial<React.ComponentProps<typeof ReviewResults>> = {}) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <ReviewResults
        reviews={[]}
        isError={false}
        onRetry={vi.fn()}
        onClearFilters={vi.fn()}
        {...props}
      />
    </NextIntlClientProvider>,
  );
}

describe("ReviewResults", () => {
  test("shows the error state, not the empty state, when the fetch failed", () => {
    // Regression: a failed page/filter fetch leaves `reviews` at `[]`, same shape as a genuinely
    // empty result — `isError` must take precedence, or a real failure renders as "no reviews
    // match these filters" with a "clear filters" button that fixes nothing.
    renderResults({ isError: true, reviews: [] });

    expect(screen.getByText("Couldn't load reviews")).toBeInTheDocument();
    expect(screen.queryByText("No reviews match these filters")).not.toBeInTheDocument();
  });

  test("shows the empty state when there genuinely are no matching reviews", () => {
    renderResults({ isError: false, reviews: [] });

    expect(screen.getByText("No reviews match these filters")).toBeInTheDocument();
    expect(screen.queryByText("Couldn't load reviews")).not.toBeInTheDocument();
  });

  test("shows the results table when reviews are present", () => {
    renderResults({ isError: false, reviews: [review()] });

    expect(screen.queryByText("Couldn't load reviews")).not.toBeInTheDocument();
    expect(screen.queryByText("No reviews match these filters")).not.toBeInTheDocument();
  });
});
