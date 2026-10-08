import { StrictMode } from "react";

import { render } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
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
    expect(error).toHaveBeenCalledWith(messages.auth.ssoErrors.NO_ACCOUNT);
  });

  it("uses the provider's own wording when the redirect names one", () => {
    renderWith("error=EMAIL_NOT_VERIFIED&provider=microsoft");
    expect(error).toHaveBeenCalledWith(messages.auth.ssoErrors.microsoft.EMAIL_NOT_VERIFIED);
  });

  it("keeps Google and Microsoft wording apart for the same code", () => {
    renderWith("error=ACCESS_DENIED&provider=google");
    expect(error).toHaveBeenCalledWith(messages.auth.ssoErrors.google.ACCESS_DENIED);
    expect(messages.auth.ssoErrors.google.ACCESS_DENIED).not.toBe(
      messages.auth.ssoErrors.microsoft.ACCESS_DENIED,
    );
  });

  it("uses the shared copy for a code the provider has no wording for", () => {
    renderWith("error=INVALID_STATE&provider=microsoft");
    expect(error).toHaveBeenCalledWith(messages.auth.ssoErrors.INVALID_STATE);
  });

  it("ignores a provider it does not know rather than building a lookup from the URL", () => {
    renderWith("error=NO_ACCOUNT&provider=../evil");
    expect(error).toHaveBeenCalledWith(messages.auth.ssoErrors.NO_ACCOUNT);
  });

  it("falls back to the provider's own fallback for an unknown code", () => {
    renderWith("error=SOMETHING_NEW&provider=microsoft");
    expect(error).toHaveBeenCalledWith(messages.auth.ssoErrors.microsoft.fallback);
  });

  it("falls back rather than crashing on a code this build does not know", () => {
    // A backend deployed ahead of the frontend must degrade, not throw.
    renderWith("error=SOMETHING_NEW");
    expect(error).toHaveBeenCalledWith(messages.auth.ssoErrors.fallback);
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
    // Regression: StrictMode's remount (in the app, any re-render before the URL change is observed) re-ran the effect, saw the
    // original `error` still, and fired a second toast; `history.replaceState` triggers no re-render.
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
