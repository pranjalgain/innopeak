import { QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ReactNode } from "react";
import { describe, expect, test, vi } from "vitest";

import { ConnectionService } from "@/app/_libs/services/connection.service";
import { createQueryClient } from "@/app/_libs/utils/query-client";
import { currentTenantQueryKey } from "@/hooks/tenant/use-tenant";

import messages from "../../../../messages/en.json";
import { useBusinessSwitcher } from "../use-business-switcher";
import { connectionQueryKey } from "../use-connection";

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

const location = (id: string) =>
  ({ id, status: "active", businessName: id, address: null }) as never;

describe("useBusinessSwitcher", () => {
  // The dashboard's business card is cached under its own key; it kept the previous location's details beside the new one's numbers.
  test("refreshes the business card when the active location changes", async () => {
    vi.spyOn(ConnectionService, "getState").mockResolvedValue({
      status: "connected",
      connectionId: "conn-1",
      providerAccountId: "acct-1",
      connectedAt: "2026-01-01T00:00:00Z",
      location: location("loc-1"),
    });
    vi.spyOn(ConnectionService, "listLocations").mockResolvedValue([location("loc-1"), location("loc-2")]);
    vi.spyOn(ConnectionService, "setActiveLocation").mockResolvedValue(location("loc-2"));
    const client = createQueryClient();
    const invalidate = vi.spyOn(client, "invalidateQueries");
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>
        <NextIntlClientProvider locale="en" messages={messages}>
          {children}
        </NextIntlClientProvider>
      </QueryClientProvider>
    );
    const { result } = renderHook(() => useBusinessSwitcher(), { wrapper });
    await waitFor(() => expect(result.current.locations).toHaveLength(2));

    await act(async () => {
      await result.current.switchTo("loc-2");
    });

    expect(invalidate.mock.calls.map((call) => call[0]?.queryKey)).toContainEqual(currentTenantQueryKey);
    expect(client.getQueryData<{ location: { id: string } }>(connectionQueryKey)?.location.id).toBe("loc-2");
  });
});
