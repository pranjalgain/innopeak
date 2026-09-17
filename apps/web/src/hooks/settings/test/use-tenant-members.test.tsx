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
    ...overrides,
  };
}

describe("useTenantMembers", () => {
  /**
   * Regression: `[...(prev ?? []), member]` looked equivalent to appending, but silently replaced
   * the whole cache with a one-element array whenever the roster query had failed or not yet
   * loaded — every other member vanished from the screen until a refetch. The fixed version only
   * appends when there is a real list to append to, and lets `invalidateQueries` fetch the truth
   * otherwise.
   */
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

    // Reflects what a real backend would now return, so the background refetch this hook
    // triggers on success (see the `invalidateQueries` test below) settles on the same answer
    // as the optimistic update above it, rather than a stale mock overwriting it back.
    getMembers.mockResolvedValue([existing, invited]);

    await act(async () => {
      await result.current.inviteMember(invited.email);
    });

    await waitFor(() => expect(result.current.members).toEqual([existing, invited]));
  });

  /**
   * Nothing pushes an invitee's acceptance to the owner's open tab — invalidating on every
   * invite/revoke is the only way the roster ever picks up a status change made elsewhere before
   * the query's own 5-minute `staleTime` lapses.
   */
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
    // Reflects what a real backend would now return, so the invalidated background refetch
    // settles on the same answer the optimistic filter below already produced.
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
});
