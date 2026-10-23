import { render } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { Tabs, TabsList, TabsTrigger } from "../tabs";

const scrollIntoView = vi.fn();

beforeEach(() => {
  scrollIntoView.mockClear();
  Element.prototype.scrollIntoView = scrollIntoView;
});

function strip(value: string) {
  return (
    <Tabs value={value}>
      <TabsList>
        <TabsTrigger value="a">A</TabsTrigger>
        <TabsTrigger value="b">B</TabsTrigger>
        <TabsTrigger value="c">C</TabsTrigger>
      </TabsList>
    </Tabs>
  );
}

// A strip wider than its box (eight tabs on a phone) scrolls sideways: a `?tab=` deep link must not leave the active tab off-screen.
describe("TabsTrigger", () => {
  test("scrolls the active tab into view, and only that one", () => {
    const { container } = render(strip("c"));

    expect(scrollIntoView).toHaveBeenCalledTimes(1);
    const target = scrollIntoView.mock.contexts[0] as HTMLElement;
    expect(target).toBe(container.querySelector('[data-state="active"]'));
    expect(scrollIntoView).toHaveBeenCalledWith({ block: "nearest", inline: "nearest" });
  });

  test("follows the active tab when it changes", () => {
    const { rerender } = render(strip("a"));
    scrollIntoView.mockClear();

    rerender(strip("b"));

    expect(scrollIntoView).toHaveBeenCalledTimes(1);
  });
});
