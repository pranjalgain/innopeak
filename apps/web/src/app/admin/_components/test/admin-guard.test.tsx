import { QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

import { SessionService } from "@/app/_libs/services/session.service";
import { createQueryClient } from "@/app/_libs/utils/query-client";

import { AdminGuard } from "../admin-guard";

const replace = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace }),
}));

function renderGuard() {
  // A fresh QueryClient per render so one test's cached `["session", "role"]` can never leak into
  // the next.
  return render(
    <QueryClientProvider client={createQueryClient()}>
      <AdminGuard>
        <div>admin content</div>
      </AdminGuard>
    </QueryClientProvider>,
  );
}

describe("AdminGuard", () => {
  afterEach(() => {
    window.localStorage.clear();
    replace.mockClear();
  });

  test("redirects to /login and renders nothing when the session isn't a super admin", async () => {
    renderGuard();

    await waitFor(() => expect(replace).toHaveBeenCalledWith("/login"));
    expect(screen.queryByText("admin content")).not.toBeInTheDocument();
  });

  test("renders children without redirecting when the session is a super admin", async () => {
    await SessionService.setRole("super_admin");

    renderGuard();

    expect(await screen.findByText("admin content")).toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
  });
});
