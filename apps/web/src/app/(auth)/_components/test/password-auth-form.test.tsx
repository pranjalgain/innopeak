import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, test, vi } from "vitest";

import messages from "../../../../../messages/en.json";
import { PasswordAuthForm } from "../password-auth-form";

function renderForm(onSubmit = vi.fn()) {
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <PasswordAuthForm isLoading={false} onSubmit={onSubmit} />
    </NextIntlClientProvider>,
  );
  return { onSubmit };
}

describe("PasswordAuthForm", () => {
  test("rejects a malformed email client-side, without calling the API", async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderForm();

    await user.type(screen.getByLabelText("Email"), "not-an-email");
    await user.type(screen.getByLabelText("Password"), "whatever");
    await user.tab();

    await waitFor(() =>
      expect(screen.getByText("Enter a valid email address.")).toBeInTheDocument(),
    );
    expect(screen.getByRole("button", { name: "Sign in" })).toBeDisabled();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  test("submits once both fields are valid", async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderForm();

    await user.type(screen.getByLabelText("Email"), "owner@coastaltable.com");
    await user.type(screen.getByLabelText("Password"), "whatever");

    const submit = screen.getByRole("button", { name: "Sign in" });
    await waitFor(() => expect(submit).toBeEnabled());
    await user.click(submit);

    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith("owner@coastaltable.com", "whatever"));
  });

  test("does not hold an existing password to the signup rules", async () => {
    const user = userEvent.setup();
    renderForm();

    await user.type(screen.getByLabelText("Email"), "owner@coastaltable.com");
    // Fails every signup rule, but sign-in must not reject a password the account legitimately has.
    await user.type(screen.getByLabelText("Password"), "abc");
    await user.tab();

    await waitFor(() => expect(screen.getByRole("button", { name: "Sign in" })).toBeEnabled());
    expect(screen.queryByText(/must contain/i)).not.toBeInTheDocument();
  });
});
