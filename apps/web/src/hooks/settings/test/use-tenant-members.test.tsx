import { QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ReactNode } from "react";
import { describe, expect, test, vi } from "vitest";

import { TenantMemberService } from "@/app/_libs/services/tenant-member.service";
import { createQueryClient } from "@/app/_libs/utils/query-client";
import type { TenantMember } from "@/types/domain";

import messages from "../../../../messages/en.json";
import { useTenantMembers } from "../use-tenant-members";

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

function wrapper({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={createQueryClient()}>
      <NextIntlClientProvider locale="en" messages={messages}>
        {children}
      </NextIntlClientProvider>
    </QueryClientProvider>
  );
}

function member(overrides: Partial<TenantMember> = {}): TenantMember {
  return {
    id: "member-1",
    name: "sam.rivera@thecoffeehouse.com",
    email: "sam.rivera@thecoffeehouse.com",
    role: "member",
    status: "invited",
    invitedAt: "2026-03-01T00:00:00Z",
    erasureRequestedAt: null,
    ...overrides,
  };
}

describe("useTenantMembers", () => {
  /** Regression: `[...(prev ?? []), member]` replaced the whole cache with one element when the roster hadn't loaded, hiding every other member. */
  test("does not clobber the roster with a single row when the list query hasn't loaded yet", async () => {
    // Never resolves — the roster query stays pending for the life of this test.
    vi.spyOn(TenantMemberService, "getMembers").mockReturnValue(new Promise(() => undefined));
    vi.spyOn(TenantMemberService, "inviteMember").mockResolvedValue(member());

    const { result } = renderHook(() => useTenantMembers(), { wrapper });

    await act(async () => {
      const succeeded = await result.current.inviteMember("sam.rivera@thecoffeehouse.com");
      expect(succeeded).toBe(true);
    });

    // The cache must still read as "not loaded" (no data), never a one-element array standing in
    // for the whole roster.
    expect(result.current.members).toEqual([]);
    expect(result.current.isLoading).toBe(true);
  });

  test("appends the new member onto an already-loaded roster", async () => {
    const existing = member({ id: "owner-1", role: "owner", status: "active" });
    const getMembers = vi.spyOn(TenantMemberService, "getMembers").mockResolvedValue([existing]);
    const invited = member({ id: "member-2" });
    vi.spyOn(TenantMemberService, "inviteMember").mockResolvedValue(invited);

    const { result } = renderHook(() => useTenantMembers(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    // Mirrors the backend so the background refetch settles on the optimistic answer, not a stale mock.
    getMembers.mockResolvedValue([existing, invited]);

    await act(async () => {
      await result.current.inviteMember(invited.email);
    });

    await waitFor(() => expect(result.current.members).toEqual([existing, invited]));
  });

  /** Nothing pushes an invitee's acceptance to the owner's tab, so every invite/revoke invalidates rather than wait out the 5-minute `staleTime`. */
  test("invalidates the roster query after a successful invite, so a background refetch can reconcile it", async () => {
    const getMembers = vi.spyOn(TenantMemberService, "getMembers").mockResolvedValue([]);
    vi.spyOn(TenantMemberService, "inviteMember").mockResolvedValue(member());

    const { result } = renderHook(() => useTenantMembers(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    getMembers.mockClear();

    await act(async () => {
      await result.current.inviteMember("sam.rivera@thecoffeehouse.com");
    });

    await waitFor(() => expect(getMembers).toHaveBeenCalled());
  });

  test("invalidates the roster query after a successful revoke", async () => {
    const target = member();
    const getMembers = vi.spyOn(TenantMemberService, "getMembers").mockResolvedValue([target]);
    vi.spyOn(TenantMemberService, "revokeInvite").mockResolvedValue(undefined);

    const { result } = renderHook(() => useTenantMembers(), { wrapper });
    await waitFor(() => expect(result.current.members).toEqual([target]));
    getMembers.mockClear();
    // Mirrors the backend so the refetch settles on what the optimistic filter produced.
    getMembers.mockResolvedValue([]);

    await act(async () => {
      await result.current.revokeInvite(target.id);
    });

    await waitFor(() => expect(result.current.members).toEqual([]));
    expect(getMembers).toHaveBeenCalled();
  });

  test("removing a member from an unloaded cache leaves it unloaded, not an empty list standing in for the roster", async () => {
    vi.spyOn(TenantMemberService, "getMembers").mockReturnValue(new Promise(() => undefined));
    vi.spyOn(TenantMemberService, "revokeInvite").mockResolvedValue(undefined);

    const { result } = renderHook(() => useTenantMembers(), { wrapper });

    await act(async () => {
      await result.current.revokeInvite("member-1");
    });

    expect(result.current.members).toEqual([]);
    expect(result.current.isLoading).toBe(true);
  });

  test("invalidates the roster query after a successful removal request, so the pending state shows up", async () => {
    const target = member({ status: "active", erasureRequestedAt: null });
    const getMembers = vi.spyOn(TenantMemberService, "getMembers").mockResolvedValue([target]);
    vi.spyOn(TenantMemberService, "requestRemoval").mockResolvedValue("Removal requested.");

    const { result } = renderHook(() => useTenantMembers(), { wrapper });
    await waitFor(() => expect(result.current.members).toEqual([target]));
    getMembers.mockClear();
    getMembers.mockResolvedValue([
      { ...target, status: "disabled", erasureRequestedAt: "2026-03-01T00:00:00Z" },
    ]);

    await act(async () => {
      await result.current.requestRemoval(target.id);
    });

    await waitFor(() =>
      expect(result.current.members[0]?.erasureRequestedAt).toBe("2026-03-01T00:00:00Z"),
    );
    expect(getMembers).toHaveBeenCalled();
  });

  test("invalidates the roster query after a successful removal cancel", async () => {
    const target = member({
      status: "disabled",
      erasureRequestedAt: "2026-03-01T00:00:00Z",
    });
    const getMembers = vi.spyOn(TenantMemberService, "getMembers").mockResolvedValue([target]);
    vi.spyOn(TenantMemberService, "cancelRemoval").mockResolvedValue(undefined);

    const { result } = renderHook(() => useTenantMembers(), { wrapper });
    await waitFor(() => expect(result.current.members).toEqual([target]));
    getMembers.mockClear();
    getMembers.mockResolvedValue([{ ...target, status: "active", erasureRequestedAt: null }]);

    await act(async () => {
      await result.current.cancelRemoval(target.id);
    });

    await waitFor(() => expect(result.current.members[0]?.erasureRequestedAt).toBeNull());
    expect(getMembers).toHaveBeenCalled();
  });

  // A failed refresh used to replace the roster (and a half-typed invite) with the error screen.
  test("keeps the roster, and reports no error, when a background refresh fails", async () => {
    const client = createQueryClient();
    const shared = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>
        <NextIntlClientProvider locale="en" messages={messages}>
          {children}
        </NextIntlClientProvider>
      </QueryClientProvider>
    );
    const getMembers = vi.spyOn(TenantMemberService, "getMembers").mockResolvedValueOnce([member()]);
    const { result } = renderHook(() => useTenantMembers(), { wrapper: shared });
    await waitFor(() => expect(result.current.members).toHaveLength(1));

    getMembers.mockRejectedValue(new Error("offline"));
    await act(async () => {
      result.current.refetch();
    });

    await waitFor(() => expect(getMembers.mock.calls.length).toBeGreaterThanOrEqual(2));
    expect(result.current.members).toHaveLength(1);
    expect(result.current.isError).toBe(false);
  });
});
