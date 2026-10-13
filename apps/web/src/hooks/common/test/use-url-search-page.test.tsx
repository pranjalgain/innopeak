import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { resetNavigation } from "@/test/mock-navigation";

import { MAX_SEARCH_LENGTH, useUrlSearchPage } from "../use-url-search-page";

vi.mock("next/navigation", async () => (await import("@/test/mock-navigation")).navigationMock);

describe("useUrlSearchPage search length", () => {
  beforeEach(() => resetNavigation("/admin/businesses"));

  // Regression: a longer term earned a 400 from the API, which the list showed as "something went wrong on our side".
  test("a pasted term is cut to the length every list API accepts", () => {
    const { result } = renderHook(() => useUrlSearchPage(0));

    act(() => result.current.setSearch("a".repeat(MAX_SEARCH_LENGTH + 150)));

    expect(result.current.search).toHaveLength(MAX_SEARCH_LENGTH);
  });

  test("a term in a linked URL is cut the same way", () => {
    resetNavigation(`/admin/businesses?q=${"b".repeat(MAX_SEARCH_LENGTH + 50)}`);
    const { result } = renderHook(() => useUrlSearchPage(0));

    expect(result.current.search).toHaveLength(MAX_SEARCH_LENGTH);
    expect(result.current.debouncedSearch.length).toBeLessThanOrEqual(MAX_SEARCH_LENGTH);
  });
});
