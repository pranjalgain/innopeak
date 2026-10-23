import { fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, test, vi } from "vitest";

import messages from "../../../../messages/en.json";
import { RouteError } from "../route-error";

const capture = vi.hoisted(() => vi.fn());
vi.mock("@sentry/nextjs", () => ({ captureException: capture }));

describe("RouteError", () => {
  // Without an error boundary in the route group, a render error replaced the whole page (shell and sign-out included).
  test("reports the error, offers a retry, and shows the reference", () => {
    const reset = vi.fn();
    const error = Object.assign(new Error("boom"), { digest: "abc123" });
    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <RouteError error={error} reset={reset} />
      </NextIntlClientProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: messages.common.loadError.retry }));

    expect(capture).toHaveBeenCalledWith(error);
    expect(reset).toHaveBeenCalledOnce();
    expect(screen.getByText("Reference: abc123")).toBeInTheDocument();
  });
});
