import { describe, expect, it } from "vitest";

import { filenameFromContentDisposition } from "@/app/_libs/utils/browser-download";

describe("filenameFromContentDisposition", () => {
  it("reads a quoted filename", () => {
    expect(filenameFromContentDisposition('attachment; filename="a-b.json"', "x.json")).toBe("a-b.json");
  });

  it("falls back for a missing, non-string or filename-less header", () => {
    expect(filenameFromContentDisposition(undefined, "x.json")).toBe("x.json");
    expect(filenameFromContentDisposition(42, "x.json")).toBe("x.json");
    expect(filenameFromContentDisposition("attachment", "x.json")).toBe("x.json");
  });
});
