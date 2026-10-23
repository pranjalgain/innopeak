import { describe, expect, test } from "vitest";

import { fitsPasswordLimit, PASSWORD_MAX_BYTES } from "../password-rules";

describe("fitsPasswordLimit", () => {
  // bcrypt reads only the first 72 bytes, so the API refuses a longer new password instead of truncating it.
  test("accepts exactly the 72 bytes bcrypt uses and refuses one more", () => {
    expect(PASSWORD_MAX_BYTES).toBe(72);
    expect(fitsPasswordLimit("a".repeat(72))).toBe(true);
    expect(fitsPasswordLimit("a".repeat(73))).toBe(false);
  });

  // 40 characters, but 80 bytes: counting characters would let this through and the API would reject it.
  test("counts UTF-8 bytes, so an accented character is two", () => {
    expect(fitsPasswordLimit("ä".repeat(36))).toBe(true);
    expect(fitsPasswordLimit("ä".repeat(37))).toBe(false);
  });
});
