import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { type ReactNode, StrictMode } from "react";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { BillingService } from "@/app/_libs/services/billing.service";
import type { Subscription } from "@/types/domain";

import { useCheckoutReconciliation } from "../use-checkout-reconciliation";

const replace = vi.fn();
let searchParams = new URLSearchParams();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace }),
  usePathname: () => "/settings",
  useSearchParams: () => searchParams,
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

const toast = vi.hoisted(() => ({ success: vi.fn(), info: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast }));

function subscription(planCode: "free" | "paid"): Subscription {
  return { planCode } as Subscription;
}

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe("useCheckoutReconciliation", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    replace.mockClear();
    toast.success.mockClear();
    toast.info.mockClear();
    toast.error.mockClear();
    searchParams = new URLSearchParams("tab=billing&checkout=success&session_id=cs_test_1");
  });

  test("does nothing without both checkout=success and a session_id", () => {
    searchParams = new URLSearchParams("tab=billing&checkout=success");
    const reconcile = vi.spyOn(BillingService, "reconcileCheckoutSession");

    renderHook(() => useCheckoutReconciliation(), { wrapper });

    expect(reconcile).not.toHaveBeenCalled();
  });

  test("ignores a cancelled checkout", () => {
    searchParams = new URLSearchParams("tab=billing&checkout=cancel&session_id=cs_test_1");
    const reconcile = vi.spyOn(BillingService, "reconcileCheckoutSession");

    renderHook(() => useCheckoutReconciliation(), { wrapper });

    expect(reconcile).not.toHaveBeenCalled();
  });

  test("reconciles once, confirms Paid with a success toast, and strips only the checkout params", async () => {
    const reconcile = vi
      .spyOn(BillingService, "reconcileCheckoutSession")
      .mockResolvedValue(subscription("paid"));

    renderHook(() => useCheckoutReconciliation(), { wrapper });

    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("checkoutReconciled"));
    expect(reconcile).toHaveBeenCalledTimes(1);
    expect(reconcile).toHaveBeenCalledWith("cs_test_1");
    expect(replace).toHaveBeenCalledWith("/settings?tab=billing", { scroll: false });
  });

  test("shows a pending notice, not a success toast, when the plan is still Free", async () => {
    vi.spyOn(BillingService, "reconcileCheckoutSession").mockResolvedValue(subscription("free"));

    renderHook(() => useCheckoutReconciliation(), { wrapper });

    await waitFor(() => expect(toast.info).toHaveBeenCalledWith("checkoutReconcilePending"));
    expect(toast.success).not.toHaveBeenCalled();
  });

  test("retries a transient failure before giving up, and only then reports the error", async () => {
    const reconcile = vi
      .spyOn(BillingService, "reconcileCheckoutSession")
      .mockRejectedValueOnce(new Error("network"))
      .mockResolvedValueOnce(subscription("paid"));

    renderHook(() => useCheckoutReconciliation(), { wrapper });

    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("checkoutReconciled"), {
      timeout: 5000,
    });
    expect(reconcile).toHaveBeenCalledTimes(2);
    expect(toast.error).not.toHaveBeenCalled();
  });

  test("keeps the params in the URL while the request is in flight", async () => {
    let resolve!: (value: Subscription) => void;
    vi.spyOn(BillingService, "reconcileCheckoutSession").mockReturnValue(
      new Promise<Subscription>((r) => {
        resolve = r;
      }),
    );

    renderHook(() => useCheckoutReconciliation(), { wrapper });
    await waitFor(() => expect(BillingService.reconcileCheckoutSession).toHaveBeenCalled());

    expect(replace).not.toHaveBeenCalled();
    resolve(subscription("paid"));
    await waitFor(() => expect(replace).toHaveBeenCalled());
  });

  /**
   * Regression: the toast and URL clean-up hung off per-call `mutate()` callbacks, which react-query drops when
   * Strict Mode detaches the observer mid-flight, so the page showed nothing and kept its `session_id`.
   */
  test("still reports the outcome and strips the params under Strict Mode", async () => {
    vi.spyOn(BillingService, "reconcileCheckoutSession").mockResolvedValue(subscription("free"));

    renderHook(() => useCheckoutReconciliation(), {
      wrapper: ({ children }) => <StrictMode>{wrapper({ children })}</StrictMode>,
    });

    await waitFor(() => expect(toast.info).toHaveBeenCalledWith("checkoutReconcilePending"));
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/settings?tab=billing", { scroll: false }));
  });

  test("exposes a pending outcome that stays after the toast, and can be re-checked", async () => {
    const reconcile = vi
      .spyOn(BillingService, "reconcileCheckoutSession")
      .mockResolvedValueOnce(subscription("free"))
      .mockResolvedValueOnce(subscription("paid"));

    const { result } = renderHook(() => useCheckoutReconciliation(), { wrapper });

    await waitFor(() => expect(result.current.outcome).toBe("pending"));

    await act(async () => {
      result.current.recheck();
    });

    await waitFor(() => expect(result.current.outcome).toBeNull());
    expect(reconcile).toHaveBeenCalledTimes(2);
    expect(reconcile).toHaveBeenLastCalledWith("cs_test_1");
    expect(toast.success).toHaveBeenCalledWith("checkoutReconciled");
  });

  test("exposes a failed outcome once every retry is spent", async () => {
    vi.spyOn(BillingService, "reconcileCheckoutSession").mockRejectedValue(new Error("down"));

    const { result } = renderHook(() => useCheckoutReconciliation(), { wrapper });

    await waitFor(() => expect(result.current.outcome).toBe("failed"), { timeout: 6000 });
    expect(toast.error).toHaveBeenCalledWith("checkoutReconcileFailed");
  });
});
