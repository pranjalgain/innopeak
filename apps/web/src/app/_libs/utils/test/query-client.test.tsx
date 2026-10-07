import { focusManager, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { act, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import { ConnectionService } from "@/app/_libs/services/connection.service";
import { createQueryClient } from "@/app/_libs/utils/query-client";
import { useConnection } from "@/hooks/connections/use-connection";

/**
 * Mirrors `ConnectionGuard`: on a failed query it fails open and mounts the child, which refetches
 * (retryOnMount). If `isLoading` went true again, the guard would swap the child for the skeleton
 * and the child would remount, forever.
 */
function Child() {
  useConnection();
  return <div>child</div>;
}

function Guard() {
  const { isLoading } = useConnection();
  return isLoading ? <div>skeleton</div> : <Child />;
}

describe("createQueryClient", () => {
  /** Regression: a failing API was hit ~100 times a second by the skeleton/children flip, and the 429s kept it failing. */
  test("a failing connection query is requested a bounded number of times, not in a mount loop", async () => {
    const getState = vi.spyOn(ConnectionService, "getState").mockRejectedValue(new Error("500"));

    render(
      <QueryClientProvider client={createQueryClient()}>
        <Guard />
      </QueryClientProvider>,
    );

    await waitFor(() => expect(screen.getByText("child")).toBeTruthy());
    await new Promise((resolve) => setTimeout(resolve, 400));

    expect(getState.mock.calls.length).toBeLessThanOrEqual(3);
  });

  test("a failed query is retried once when the tab regains focus, and a healthy one is not", async () => {
    const failing = vi.fn().mockRejectedValueOnce(new Error("500")).mockResolvedValue("ok");
    const healthy = vi.fn().mockResolvedValue("fine");

    function Probe() {
      const bad = useQuery({ queryKey: ["bad"], queryFn: failing });
      useQuery({ queryKey: ["good"], queryFn: healthy });
      return <div>{bad.status}</div>;
    }

    render(
      <QueryClientProvider client={createQueryClient()}>
        <Probe />
      </QueryClientProvider>,
    );
    await waitFor(() => expect(screen.getByText("error")).toBeTruthy());

    act(() => {
      focusManager.setFocused(false);
      focusManager.setFocused(true);
    });

    await waitFor(() => expect(screen.getByText("success")).toBeTruthy());
    expect(failing).toHaveBeenCalledTimes(2);
    expect(healthy).toHaveBeenCalledTimes(1);
  });
});
