import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, test } from "vitest";

import type { Review } from "@/types/domain";

import messages from "../../../../../../messages/en.json";
import { ReviewTable } from "../review-table";

const review = (overrides: Partial<Review> = {}): Review =>
  ({
    id: "rev-1",
    reviewerName: "Babla Gain",
    rating: 4,
    reviewText: "Good food.",
    reviewedAt: "2026-10-01T10:00:00.000Z",
    classification: null,
    escalationReason: null,
    status: "new",
    ...overrides,
  }) as Review;

describe("ReviewTable", () => {
  // The row used to be a `<tr onClick>`: not focusable, not a link, no new tab. The way into a review must be a real link.
  test("opens a review through a real link a keyboard can reach", () => {
    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <ReviewTable reviews={[review()]} />
      </NextIntlClientProvider>,
    );

    const link = screen.getByRole("link", { name: "Babla Gain" });

    expect(link).toHaveAttribute("href", "/review-queue/rev-1");
  });

  test("names an anonymous reviewer's link in the viewer's language", () => {
    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <ReviewTable reviews={[review({ reviewerName: null })]} />
      </NextIntlClientProvider>,
    );

    expect(screen.getByRole("link", { name: "Anonymous" })).toBeInTheDocument();
  });
});
