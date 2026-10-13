import { describe, expect, test, vi } from "vitest";

import { ApiError } from "@/app/_libs/services/api-error";
import { AvatarUploadError, AvatarUploadService } from "@/app/_libs/services/avatar-upload.service";

const file = (name: string, type: string, bytes = 100) =>
  new File([new Uint8Array(bytes)], name, { type });

const MESSAGES = {
  fallback: "Could not save.",
  tooLarge: "Too large.",
  unsupportedType: "Wrong type.",
};

describe("AvatarUploadService.validate", () => {
  test.each(["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif", "image/heic", "image/bmp"])(
    "accepts %s",
    (type) => {
      expect(() => AvatarUploadService.validate(file("a", type))).not.toThrow();
    },
  );

  test.each([
    ["notes.txt", "text/plain"],
    ["doc.pdf", "application/pdf"],
    // An SVG can carry a script and the avatar renders in an <img>.
    ["logo.svg", "image/svg+xml"],
  ])("refuses %s (%s) as an unsupported type", (name, type) => {
    expect(() => AvatarUploadService.validate(file(name, type))).toThrowError(
      expect.objectContaining({ kind: "unsupportedType" }),
    );
  });

  test("falls back to the extension when the browser reports no type (HEIC on Windows)", () => {
    expect(() => AvatarUploadService.validate(file("IMG_0001.HEIC", ""))).not.toThrow();
    expect(() => AvatarUploadService.validate(file("notes.txt", ""))).toThrowError(
      expect.objectContaining({ kind: "unsupportedType" }),
    );
  });

  test("refuses a file over 10 MB", () => {
    expect(() =>
      AvatarUploadService.validate(file("big.png", "image/png", 10 * 1024 * 1024 + 1)),
    ).toThrowError(expect.objectContaining({ kind: "tooLarge" }));
    expect(() =>
      AvatarUploadService.validate(file("ok.png", "image/png", 10 * 1024 * 1024)),
    ).not.toThrow();
  });

  test("upload() refuses before sending anything", async () => {
    const send = vi.spyOn(globalThis, "fetch");

    await expect(
      AvatarUploadService.upload(file("notes.txt", "text/plain"), {
        uploadUrl: "https://example.test/upload",
        formFields: {},
      } as never),
    ).rejects.toBeInstanceOf(AvatarUploadError);

    expect(send).not.toHaveBeenCalled();
  });
});

describe("AvatarUploadService.errorMessage", () => {
  test("names our own refusals in the caller's language", () => {
    expect(AvatarUploadService.errorMessage(new AvatarUploadError("x", "tooLarge"), MESSAGES)).toBe(
      "Too large.",
    );
    expect(
      AvatarUploadService.errorMessage(new AvatarUploadError("x", "unsupportedType"), MESSAGES),
    ).toBe("Wrong type.");
  });

  test("never shows the provider's raw English text", () => {
    expect(
      AvatarUploadService.errorMessage(
        new AvatarUploadError("Raw file format txt not allowed"),
        MESSAGES,
      ),
    ).toBe("Could not save.");
  });

  test("shows a 400 from our own API (already localized) and falls back for anything else", () => {
    expect(
      AvatarUploadService.errorMessage(new ApiError(400, "Dieses Bild ist ungültig."), MESSAGES),
    ).toBe("Dieses Bild ist ungültig.");
    expect(AvatarUploadService.errorMessage(new ApiError(500, "boom"), MESSAGES)).toBe("Could not save.");
    expect(AvatarUploadService.errorMessage(new Error("network"), MESSAGES)).toBe("Could not save.");
  });
});
