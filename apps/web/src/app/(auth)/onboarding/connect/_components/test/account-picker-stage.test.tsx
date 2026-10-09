import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import type { ComponentProps } from "react";
import { describe, expect, test, vi } from "vitest";

import messages from "../../../../../../../messages/en.json";
import { AccountPickerStage } from "../account-picker-stage";

const ACCOUNTS = [
  { accountId: "accounts/1", name: "Jane Doe", type: "PERSONAL" },
  { accountId: "accounts/2", name: "Coastal Group", type: "LOCATION_GROUP" },
];

function renderStage(overrides: Partial<ComponentProps<typeof AccountPickerStage>> = {}) {
  const onSelect = vi.fn();
  const onContinue = vi.fn();
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <AccountPickerStage
        accounts={ACCOUNTS}
        selectedAccountId={null}
        onSelect={onSelect}
        onContinue={onContinue}
        {...overrides}
      />
    </NextIntlClientProvider>,
  );
  return { onSelect, onContinue };
}

describe("AccountPickerStage", () => {
  test("lists every account as a radio option, named, with its type", () => {
    renderStage();

    expect(screen.getAllByRole("radio")).toHaveLength(2);
    expect(screen.getByText("Jane Doe")).toBeInTheDocument();
    expect(screen.getByText("Personal account")).toBeInTheDocument();
    expect(screen.getByText("Coastal Group")).toBeInTheDocument();
    expect(screen.getByText("Location group")).toBeInTheDocument();
  });

  test("preselects nothing and keeps Continue off until one is chosen", () => {
    renderStage();

    for (const radio of screen.getAllByRole("radio")) expect(radio).not.toBeChecked();
    expect(screen.getByRole("button", { name: "Continue" })).toBeDisabled();
  });

  test("labels the radio group after the heading", () => {
    renderStage();

    expect(
      screen.getByRole("radiogroup", { name: "Which account is your business under?" }),
    ).toBeInTheDocument();
  });

  test("reports the chosen account's id", async () => {
    const user = userEvent.setup();
    const { onSelect } = renderStage();

    await user.click(screen.getAllByRole("radio")[1]!);

    expect(onSelect).toHaveBeenCalledWith("accounts/2");
  });

  test("enables Continue once an account is chosen, and submits", async () => {
    const user = userEvent.setup();
    const { onContinue } = renderStage({ selectedAccountId: "accounts/1" });

    const button = screen.getByRole("button", { name: "Continue" });
    expect(button).toBeEnabled();
    await user.click(button);

    expect(onContinue).toHaveBeenCalledTimes(1);
  });

  test("disables Continue while submitting", () => {
    renderStage({ selectedAccountId: "accounts/1", isSubmitting: true });

    expect(screen.getByRole("button", { name: "Continue" })).toBeDisabled();
  });

  test("copes with an account Google gave no name or an unknown type", () => {
    renderStage({
      accounts: [{ accountId: "accounts/9", name: null, type: "SOMETHING_NEW" }],
    });

    expect(screen.getByText("Unnamed account")).toBeInTheDocument();
    expect(screen.queryByText("SOMETHING_NEW")).not.toBeInTheDocument();
  });
});
