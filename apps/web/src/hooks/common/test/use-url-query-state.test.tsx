import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { resetNavigation } from "@/test/mock-navigation";

import { parsePageParam, useUrlQueryState } from "../use-url-query-state";

vi.mock("next/navigation", async () => (await import("@/test/mock-navigation")).navigationMock);

describe("useUrlQueryState", () => {
  beforeEach(() => resetNavigation("/review-queue"));

  test("sets and removes parameters in one navigation, leaving the others alone", () => {
    resetNavigation("/review-queue?tab=x&page=3");
    const { result } = renderHook(() => useUrlQueryState());

    act(() => result.current.update({ status: "new", page: null }));

    expect(window.location.search).toBe("?tab=x&status=new");
    expect(result.current.searchParams.get("status")).toBe("new");
  });

  test("two updates in the same tick do not overwrite each other", () => {
    const { result } = renderHook(() => useUrlQueryState());

    act(() => {
      result.current.update({ a: "1" });
      result.current.update({ b: "2" });
    });

    expect(window.location.search).toBe("?a=1&b=2");
  });

  test("push adds a history entry and replace does not", () => {
    const { result } = renderHook(() => useUrlQueryState());
    const before = window.history.length;

    act(() => result.current.update({ a: "1" }, "replace"));
    expect(window.history.length).toBe(before);

    act(() => result.current.update({ a: "2" }, "push"));
    expect(window.history.length).toBe(before + 1);
  });

  test("an update that changes nothing does not navigate", () => {
    resetNavigation("/review-queue?a=1");
    const { result } = renderHook(() => useUrlQueryState());
    const before = window.history.length;

    act(() => result.current.update({ a: "1" }, "push"));

    expect(window.history.length).toBe(before);
  });
});

describe("parsePageParam", () => {
  test.each([
    [null, 1],
    ["", 1],
    ["abc", 1],
    ["0", 1],
    ["-4", 1],
    ["1", 1],
    ["7", 7],
    ["3.9", 3],
  ])("%j -> %i", (raw, expected) => {
    expect(parsePageParam(raw)).toBe(expected);
  });
});
