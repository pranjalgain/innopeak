import { QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ReactNode } from "react";
import { describe, expect, test, vi } from "vitest";

import { BillingService } from "@/app/_libs/services/billing.service";
import { createQueryClient } from "@/app/_libs/utils/query-client";
import { connectionQueryKey } from "@/hooks/connections/use-connection";
import { currentTenantQueryKey } from "@/hooks/tenant/use-tenant";

import messages from "../../../../messages/en.json";
import { useSetActiveLocation } from "../use-set-active-location";

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

describe("useSetActiveLocation", () => {
  // The dashboard's business card is built from the connection and cached under its own key: it kept the previous location after a swap.
  test("refreshes the connection and the business card once the active location changes", async () => {
    vi.spyOn(BillingService, "setActiveLocation").mockResolvedValue(undefined as never);
    const client = createQueryClient();
    const invalidate = vi.spyOn(client, "invalidateQueries");
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>
        <NextIntlClientProvider locale="en" messages={messages}>
          {children}
        </NextIntlClientProvider>
      </QueryClientProvider>
    );
    const { result } = renderHook(() => useSetActiveLocation(), { wrapper });

    await act(async () => {
      await result.current.setActiveLocation("loc-2");
    });

    const keys = invalidate.mock.calls.map((call) => call[0]?.queryKey);
    expect(keys).toContainEqual(connectionQueryKey);
    expect(keys).toContainEqual(currentTenantQueryKey);
  });
});
