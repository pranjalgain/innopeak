import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

import { GoogleConnectionService } from "@/app/_libs/services/google-connection.service";

import { GoogleConnectionGuard } from "./google-connection-guard";

const replace = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace }),
}));

describe("GoogleConnectionGuard", () => {
  afterEach(() => {
    window.localStorage.clear();
    replace.mockClear();
  });

  test("redirects to onboarding-connect and renders nothing when disconnected", async () => {
    render(
      <GoogleConnectionGuard>
        <div>protected content</div>
      </GoogleConnectionGuard>,
    );

    await waitFor(() => expect(replace).toHaveBeenCalledWith("/onboarding/connect"));
    expect(screen.queryByText("protected content")).not.toBeInTheDocument();
  });

  test("renders children without redirecting when connected", async () => {
    await GoogleConnectionService.setStatus("connected");

    render(
      <GoogleConnectionGuard>
        <div>protected content</div>
      </GoogleConnectionGuard>,
    );

    expect(await screen.findByText("protected content")).toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
  });
});
