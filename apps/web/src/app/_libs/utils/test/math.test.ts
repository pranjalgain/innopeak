import { describe, expect, test } from "vitest";

import { add, multiply } from "../math";

describe("Math utilities", () => {
  describe("add", () => {
    test("should add two positive numbers", () => {
      expect(add(2, 3)).toBe(5);
    });

    test("should add negative numbers", () => {
      expect(add(-2, -3)).toBe(-5);
    });

    test("should add zero", () => {
      expect(add(5, 0)).toBe(5);
    });
  });

  describe("multiply", () => {
    test("should multiply two numbers", () => {
      expect(multiply(3, 4)).toBe(12);
    });

    test("should handle zero", () => {
      expect(multiply(5, 0)).toBe(0);
    });
  });
});
