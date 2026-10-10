import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { useAdminBusinesses } from "@/hooks/admin/use-admin-businesses";
import type { AdminBusiness } from "@/types/domain";

import messages from "../../../../../../messages/en.json";
import { AdminBusinessesView } from "../admin-businesses-view";

vi.mock("@/hooks/admin/use-admin-businesses", () => ({ useAdminBusinesses: vi.fn() }));

function business(overrides: Partial<AdminBusiness> = {}): AdminBusiness {
  return {
    id: "biz-1",
    name: "The Coffee House",
    status: "suspended",
    connectionStatus: "connected",
    ownerName: "Pranjal Gain",
    ownerEmail: "owner@coffee.test",
    userCount: 1,
    createdAt: "2026-10-08T00:00:00.000Z",
    erasureRequestedAt: "2026-10-08T00:00:00.000Z",
    ...overrides,
  };
}

function show(value: AdminBusiness) {
  vi.mocked(useAdminBusinesses).mockReturnValue({
    businesses: [value],
    page: 1,
    totalPages: 1,
    total: 1,
    goToPreviousPage: vi.fn(),
    goToNextPage: vi.fn(),
    search: "",
    setSearch: vi.fn(),
    isSearching: false,
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
    suspendBusiness: vi.fn(),
    reactivateBusiness: vi.fn(),
    requestErasure: vi.fn(),
    cancelErasure: vi.fn(),
  } as unknown as ReturnType<typeof useAdminBusinesses>);
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <AdminBusinessesView />
    </NextIntlClientProvider>,
  );
}

describe("AdminBusinessesView status column", () => {
  beforeEach(() => {
    vi.mocked(useAdminBusinesses).mockReset();
  });

  // Regression: table cells never wrap by default, so the note ran on past the fixed-width Status column into Owner.
  test("lets the erasure note wrap inside the status cell instead of spilling into Owner", () => {
    show(business());

    const note = screen.getAllByText(/Erasure takes effect on/)[0]!;
    const statusCell = note.closest("td");
    const ownerCell = screen.getAllByText("Pranjal Gain")[0]!.closest("td");

    expect(statusCell).toHaveClass("whitespace-normal");
    expect(statusCell).not.toBe(ownerCell);
    expect(statusCell?.contains(screen.getAllByText("Suspended")[0]!)).toBe(true);
  });

  test("shows no note for a business with no erasure pending", () => {
    show(business({ erasureRequestedAt: null }));

    expect(screen.queryByText(/Erasure takes effect on/)).not.toBeInTheDocument();
  });
});
