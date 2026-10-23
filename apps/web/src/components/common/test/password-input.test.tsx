import { fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, test } from "vitest";

import messages from "../../../../messages/en.json";
import { PasswordInput } from "../password-input";

describe("PasswordInput", () => {
  function renderInput() {
    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <PasswordInput aria-label="Password" />
      </NextIntlClientProvider>,
    );
    return screen.getByRole("button", { name: messages.common.passwordInput.show });
  }

  // A toggle keeps one name and reports its state with aria-pressed: a label that also flipped read "Hide password, pressed".
  test("is a focusable toggle with a constant name and a pressed state", () => {
    const toggle = renderInput();

    expect(toggle).not.toHaveAttribute("tabindex", "-1");
    expect(toggle).toHaveAttribute("aria-pressed", "false");

    fireEvent.click(toggle);

    expect(screen.getByRole("button", { name: messages.common.passwordInput.show })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByLabelText("Password")).toHaveAttribute("type", "text");
  });
});
