import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, test, vi } from "vitest";

import type { PostErasureCharge } from "@/types/domain";

import messages from "../../../../../../messages/en.json";
import { PostErasureChargesPanel } from "../post-erasure-charges-panel";

const t = messages.adminBilling.postErasureCharges;

const charge: PostErasureCharge = {
  receiptId: "receipt-1",
  businessName: "The Coffee House",
  invoiceNumber: "INV-1",
  amountPaid: 4900,
  currency: "eur",
  paidAt: "2026-10-01T10:00:00.000Z",
} as PostErasureCharge;

function renderPanel(onResolve: (id: string) => Promise<boolean>) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <PostErasureChargesPanel charges={[charge]} onResolve={onResolve} />
    </NextIntlClientProvider>,
  );
}

describe("PostErasureChargesPanel", () => {
  // The entry leaves the list for good, so one stray click must not be enough.
  test("asks before marking a charge handled, and does nothing until confirmed", async () => {
    const onResolve = vi.fn().mockResolvedValue(true);
    renderPanel(onResolve);

    fireEvent.click(screen.getByRole("button", { name: t.resolve }));

    expect(onResolve).not.toHaveBeenCalled();
    expect(screen.getByText(t.confirm.title)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: t.confirm.confirm }));

    await waitFor(() => expect(onResolve).toHaveBeenCalledWith("receipt-1"));
  });

  test("cancelling leaves the charge on the list untouched", () => {
    const onResolve = vi.fn().mockResolvedValue(true);
    renderPanel(onResolve);

    fireEvent.click(screen.getByRole("button", { name: t.resolve }));
    fireEvent.click(screen.getByRole("button", { name: t.confirm.cancel }));

    expect(onResolve).not.toHaveBeenCalled();
  });
});
