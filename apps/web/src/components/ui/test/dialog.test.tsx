import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, test } from "vitest";

import messagesDe from "../../../../messages/de.json";
import messages from "../../../../messages/en.json";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "../dialog";

function renderDialog(locale: "de" | "en") {
  return render(
    <NextIntlClientProvider locale={locale} messages={locale === "de" ? messagesDe : messages}>
      <Dialog open>
        <DialogContent>
          <DialogTitle>Title</DialogTitle>
          <DialogDescription>Body</DialogDescription>
        </DialogContent>
      </Dialog>
    </NextIntlClientProvider>,
  );
}

describe("DialogContent", () => {
  // It was a hard-coded English "Close" for every user.
  test.each([
    ["en", "Close"],
    ["de", "Schließen"],
  ] as const)("names its close button in %s", (locale, label) => {
    renderDialog(locale);

    expect(screen.getByRole("button", { name: label })).toBeInTheDocument();
  });

  // A tall dialog was clipped on a phone with Save and Close unreachable, and body scroll locked.
  test("stays inside the viewport and scrolls its own content", () => {
    renderDialog("en");

    const content = screen.getByRole("dialog");
    expect(content.className).toContain("max-h-[calc(100dvh-2rem)]");
    expect(content.className).toContain("overflow-y-auto");
  });
});
