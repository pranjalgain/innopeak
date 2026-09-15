import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, test, vi } from "vitest";

import messages from "../../../../../../../messages/en.json";
import { CreateAccountForm } from "../create-account-form";

function renderForm(onSubmit = vi.fn()) {
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <CreateAccountForm isLoading={false} onSubmit={onSubmit} />
    </NextIntlClientProvider>,
  );
  return { onSubmit };
}

async function fillValid(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText("Full name"), "Jordan Lee");
  await user.type(screen.getByLabelText("Company name"), "The Coffee House");
  await user.type(screen.getByLabelText("Email"), "jordan@coffeehouse.com");
  await user.type(screen.getByLabelText("Password"), "Password1!");
  await user.type(screen.getByLabelText("Confirm password"), "Password1!");
}

describe("CreateAccountForm", () => {
  test("submit stays disabled until every zod rule passes", async () => {
    const user = userEvent.setup();
    renderForm();

    const submit = screen.getByRole("button", { name: "Create account" });
    expect(submit).toBeDisabled();

    await fillValid(user);

    await waitFor(() => expect(submit).toBeEnabled());
  });

  test("surfaces the schema's message once a field has been blurred, not on first keystroke", async () => {
    const user = userEvent.setup();
    renderForm();

    const email = screen.getByLabelText("Email");
    await user.type(email, "not-an-email");
    // mode: "onTouched" — nothing yet, the field has not been blurred.
    expect(screen.queryByText("Enter a valid email address.")).not.toBeInTheDocument();

    await user.tab();
    await waitFor(() =>
      expect(screen.getByText("Enter a valid email address.")).toBeInTheDocument(),
    );
  });

  test("flags a confirm-password mismatch against the password field", async () => {
    const user = userEvent.setup();
    renderForm();

    await user.type(screen.getByLabelText("Password"), "Password1!");
    await user.type(screen.getByLabelText("Confirm password"), "Password2!");
    await user.tab();

    await waitFor(() => expect(screen.getByText("Passwords don't match.")).toBeInTheDocument());
    expect(screen.getByRole("button", { name: "Create account" })).toBeDisabled();
  });

  test("shows the live requirements checklist for an unmet password, after blur", async () => {
    const user = userEvent.setup();
    renderForm();

    const password = screen.getByLabelText("Password");
    await user.type(password, "short");
    await user.tab();

    await waitFor(() => expect(screen.getByText("At least 8 characters")).toBeInTheDocument());
    // The checklist stands in for the field-level message, so the rule text is not duplicated.
    expect(
      screen.queryByText("Password must be at least 8 characters."),
    ).not.toBeInTheDocument();
  });

  test("hides the checklist again once every rule passes", async () => {
    const user = userEvent.setup();
    renderForm();

    const password = screen.getByLabelText("Password");
    await user.type(password, "short");
    await user.tab();
    await waitFor(() => expect(screen.getByText("At least 8 characters")).toBeInTheDocument());

    await user.clear(password);
    await user.type(password, "Password1!");

    // All five rules met — a column of green ticks carries no information, so it goes away.
    await waitFor(() =>
      expect(screen.queryByText("At least 8 characters")).not.toBeInTheDocument(),
    );
  });

  test("submits the payload without confirmPassword", async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderForm();

    await fillValid(user);
    await user.click(screen.getByRole("button", { name: "Create account" }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledWith({
      name: "Jordan Lee",
      businessName: "The Coffee House",
      email: "jordan@coffeehouse.com",
      password: "Password1!",
    });
  });
});
