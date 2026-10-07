import { QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { BillingService } from "@/app/_libs/services/billing.service";
import { createQueryClient } from "@/app/_libs/utils/query-client";

import messages from "../../../../../../messages/en.json";
import DummyCheckoutRoute from "../page";

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams("subscriptionId=dummy_sub_1"),
}));
vi.mock("@/app/_components/require-auth", () => ({
  RequireAuth: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock("@/app/(auth)/_components/auth-logo", () => ({ AuthLogo: () => null }));

function renderPage() {
  return render(
    <StrictMode>
      <QueryClientProvider client={createQueryClient()}>
        <NextIntlClientProvider locale="en" messages={messages}>
          <DummyCheckoutRoute />
        </NextIntlClientProvider>
      </QueryClientProvider>
    </StrictMode>,
  );
}

describe("DummyCheckoutRoute", () => {
  const originalLocation = window.location;

  beforeEach(() => {
    vi.restoreAllMocks();
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { href: "http://localhost/billing/dummy-checkout" },
    });
  });

  afterEach(() => {
    Object.defineProperty(window, "location", { configurable: true, value: originalLocation });
  });

  // Guards the redirect hanging off a per-`mutate()` `onSuccess`, which Strict Mode's remount
  // drops, leaving the page on its spinner.
  test("redirects to the billing success page once the completion call succeeds, under Strict Mode", async () => {
    const complete = vi.spyOn(BillingService, "completeDummyCheckout").mockResolvedValue();

    renderPage();

    await waitFor(() =>
      expect(window.location.href).toBe("/settings?tab=billing&checkout=success"),
    );
    expect(complete).toHaveBeenCalledTimes(1);
    expect(complete).toHaveBeenCalledWith("dummy_sub_1");
  });

  test("shows the error state with a retry control and does not redirect when the call fails", async () => {
    vi.spyOn(BillingService, "completeDummyCheckout").mockRejectedValue(new Error("boom"));

    renderPage();

    expect(
      await screen.findByText(messages.settings.billing.dummyCheckout.retry),
    ).toBeTruthy();
    expect(window.location.href).toBe("http://localhost/billing/dummy-checkout");
  });
});
