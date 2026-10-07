import { fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, test, vi } from "vitest";

import messages from "../../../../../../messages/en.json";
import { CheckoutStatusBanner } from "../checkout-status-banner";

const copy = messages.settings.billing.checkoutStatus;

function renderBanner(props: Partial<React.ComponentProps<typeof CheckoutStatusBanner>> = {}) {
  const onRecheck = vi.fn();
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <CheckoutStatusBanner outcome="pending" isChecking={false} onRecheck={onRecheck} {...props} />
    </NextIntlClientProvider>,
  );
  return onRecheck;
}

describe("CheckoutStatusBanner", () => {
  test("renders nothing when there is nothing to report", () => {
    renderBanner({ outcome: null });

    expect(screen.queryByRole("alert")).toBeNull();
  });

  test("explains a payment that is still processing and lets the owner check again", () => {
    const onRecheck = renderBanner({ outcome: "pending" });

    expect(screen.getByText(copy.pendingTitle)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: copy.checkAgain }));
    expect(onRecheck).toHaveBeenCalledTimes(1);
  });

  test("says Stripe could not be reached when confirmation failed", () => {
    renderBanner({ outcome: "failed" });

    expect(screen.getByText(copy.failedTitle)).toBeTruthy();
  });

  test("disables the button while a check is in flight", () => {
    renderBanner({ isChecking: true });

    expect((screen.getByRole("button", { name: copy.checking }) as HTMLButtonElement).disabled).toBe(
      true,
    );
  });
});
