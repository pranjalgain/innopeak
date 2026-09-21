import { render } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { StrictMode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import messages from "@/../messages/en.json";
import { useOAuthErrorToast } from "@/hooks/auth/use-oauth-error-toast";

const error = vi.fn();
vi.mock("sonner", () => ({ toast: { error: (...a: unknown[]) => error(...a) } }));

let params = new URLSearchParams();
vi.mock("next/navigation", () => ({
  usePathname: () => "/login",
  useSearchParams: () => params,
}));

function Probe() {
  useOAuthErrorToast();
  return null;
}

function renderWith(qs: string) {
  params = new URLSearchParams(qs);
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <Probe />
    </NextIntlClientProvider>,
  );
}

describe("useOAuthErrorToast", () => {
  beforeEach(() => {
    error.mockClear();
    window.history.replaceState(null, "", "/login?error=x");
  });

  it("shows the specific message for a known failure code", () => {
    renderWith("error=NO_ACCOUNT");
    expect(error).toHaveBeenCalledWith(messages.auth.googleErrors.NO_ACCOUNT);
  });

  it("falls back rather than crashing on a code this build does not know", () => {
    // A backend deployed ahead of the frontend must degrade, not throw.
    renderWith("error=SOMETHING_NEW");
    expect(error).toHaveBeenCalledWith(messages.auth.googleErrors.fallback);
  });

  it("strips the param so a refresh cannot replay a stale error", () => {
    renderWith("error=ACCESS_DENIED");
    expect(window.location.search).toBe("");
  });

  it("stays silent when there is no error param", () => {
    renderWith("");
    expect(error).not.toHaveBeenCalled();
  });

  it("shows the error only once even if the effect re-runs while the same error is still present", () => {
    // StrictMode deliberately mounts, tears down, and remounts every component once in
    // development specifically to surface effects that aren't safe to run twice — which this one
    // wasn't: `history.replaceState` tidies up the *browser's* URL bar, but nothing here re-renders
    // in response to it, so a second effect run (StrictMode's remount here; in the app, any
    // unrelated re-render of `LoginView` before that URL change is otherwise observed) still saw
    // the original `error` and fired a second toast for it.
    params = new URLSearchParams("error=NO_ACCOUNT");
    render(
      <StrictMode>
        <NextIntlClientProvider locale="en" messages={messages}>
          <Probe />
        </NextIntlClientProvider>
      </StrictMode>,
    );

    expect(error).toHaveBeenCalledTimes(1);
  });
});
