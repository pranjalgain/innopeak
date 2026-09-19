import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { useQueryErrorToast } from "../use-query-error-toast";

const toast = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }));
vi.mock("sonner", () => ({ toast }));

/**
 * Regression: this hook exists specifically because a plain `useEffect(() => { if (isError)
 * toast.error(...) }, [isError])` shows the same toast once per mounted component, not once per
 * actual failure — e.g. `useTenantOwnerProfile`'s load-failure toast used to fire twice on any
 * dashboard page (shell layout + settings page both reading the same query) and four times on
 * `/settings?tab=profile`. Each test below uses its own query key so the module-level dedup map
 * doesn't leak state between them.
 */
describe("useQueryErrorToast", () => {
  beforeEach(() => {
    toast.error.mockClear();
  });

  test("shows the toast only once when two simultaneously mounted callers share the same failed query", () => {
    const queryKey = ["shared-query", "two-callers"];
    const failedQuery = { isError: true, errorUpdatedAt: 1000 };

    renderHook(() => useQueryErrorToast(queryKey, failedQuery, "Could not load."));
    renderHook(() => useQueryErrorToast(queryKey, failedQuery, "Could not load."));

    expect(toast.error).toHaveBeenCalledTimes(1);
  });

  test("shows the toast again for a genuinely new failure of the same query", () => {
    const queryKey = ["shared-query", "new-failure"];

    const { rerender } = renderHook(
      ({ query }: { query: { isError: boolean; errorUpdatedAt: number } }) =>
        useQueryErrorToast(queryKey, query, "Could not load."),
      { initialProps: { query: { isError: true, errorUpdatedAt: 1 } } },
    );
    expect(toast.error).toHaveBeenCalledTimes(1);

    // A retry succeeds in between, then a later, distinct attempt fails again.
    rerender({ query: { isError: false, errorUpdatedAt: 1 } });
    rerender({ query: { isError: true, errorUpdatedAt: 2 } });

    expect(toast.error).toHaveBeenCalledTimes(2);
  });

  test("does not toast when there is no error", () => {
    const queryKey = ["shared-query", "no-error"];

    renderHook(() => useQueryErrorToast(queryKey, { isError: false, errorUpdatedAt: 0 }, "x"));

    expect(toast.error).not.toHaveBeenCalled();
  });
});
