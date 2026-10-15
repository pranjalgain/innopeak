import { renderHook } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ReactNode } from "react";
import { describe, expect, test } from "vitest";

import type { PlatformActivityEntry } from "@/types/domain";

import de from "../../../../messages/de.json";
import en from "../../../../messages/en.json";
import { useActivityMessage } from "../use-activity-message";

const entry = (overrides: Partial<PlatformActivityEntry>): PlatformActivityEntry => ({
  id: "a1",
  type: "business_suspended",
  actorEmail: "admin@innopeak.com",
  occurredAt: "2026-10-15T09:00:00.000Z",
  ...overrides,
});

function describeIn(locale: "en" | "de", target: PlatformActivityEntry): string {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <NextIntlClientProvider locale={locale} messages={locale === "en" ? en : de}>
      {children}
    </NextIntlClientProvider>
  );
  return renderHook(() => useActivityMessage(), { wrapper }).result.current(target);
}

describe("useActivityMessage", () => {
  test("fills the template for a business entry", () => {
    expect(describeIn("en", entry({ type: "business_suspended", businessName: "Oak & Iron" }))).toBe(
      "Suspended Oak & Iron",
    );
  });

  test("says a new business joined", () => {
    expect(
      describeIn("en", entry({ type: "business_joined", businessName: "The Coastal Table" })),
    ).toBe('New business "The Coastal Table" signed up');
  });

  describe("a platform settings change", () => {
    const changed = (changes: { field: string; from: boolean; to: boolean }[], lockout = false) =>
      entry({
        type: "platform_settings_changed",
        details: { changes, ...(lockout ? { lockoutConfirmed: true } : {}) },
      });

    test("lists each switch with its new state, by the label the settings screen uses", () => {
      expect(
        describeIn(
          "en",
          changed([
            { field: "googleLoginEnabled", from: true, to: false },
            { field: "inviteMembersEnabled", from: false, to: true },
          ]),
        ),
      ).toBe("Changed platform settings — Google sign-in: off; Invite teammates: on");
    });

    test("notes when the admin confirmed a lockout", () => {
      expect(
        describeIn("en", changed([{ field: "googleLoginEnabled", from: true, to: false }], true)),
      ).toContain("confirmed despite users who could only sign in that way");
    });

    test("falls back to the raw field name for a setting this screen does not know yet", () => {
      expect(
        describeIn("en", changed([{ field: "someFutureSwitch", from: false, to: true }])),
      ).toBe("Changed platform settings — someFutureSwitch: on");
    });

    test("reads in German too", () => {
      expect(
        describeIn("de", changed([{ field: "googleLoginEnabled", from: true, to: false }])),
      ).toBe("Plattformeinstellungen geändert — Google-Anmeldung: aus");
    });
  });
});
