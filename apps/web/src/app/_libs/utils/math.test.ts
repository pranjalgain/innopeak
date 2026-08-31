import { describe, expect, test } from "vitest";

import { add, formatCurrency, multiply } from "./math";

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

  describe("formatCurrency", () => {
    test("should format USD currency by default", () => {
      expect(formatCurrency(1234.56)).toBe("$1,234.56");
    });

    test("should format different currencies", () => {
      expect(formatCurrency(1234.56, "EUR")).toBe("€1,234.56");
    });

    test("should handle zero amount", () => {
      expect(formatCurrency(0)).toBe("$0.00");
    });
  });
});
