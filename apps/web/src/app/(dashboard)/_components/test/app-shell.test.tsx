import { render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { LuLayoutDashboard, LuSettings } from "react-icons/lu";
import { beforeEach, describe, expect, test, vi } from "vitest";

import messages from "../../../../../messages/en.json";
import { AppShell } from "../app-shell";

const breakpoint = vi.hoisted(() => ({ value: "desktop" as "desktop" | "mobile" | "tablet" }));
vi.mock("@/hooks/common/use-breakpoint", () => ({ useBreakpoint: () => breakpoint.value }));
vi.mock("@/hooks/common/use-mobile", () => ({ useIsMobile: () => false }));
vi.mock("next/navigation", () => ({ usePathname: () => "/settings" }));
vi.mock("@/hooks/auth/use-auth", () => ({ useAuth: () => ({ logout: vi.fn() }) }));
// The header carries the notification bell, switchers and menus, which have their own tests; only its landmark role matters here.
vi.mock("@/app/(dashboard)/_components/app-header", () => ({
  AppHeader: ({ title }: { title: string }) => <h1>{title}</h1>,
}));

const navItems = [
  { labelKey: "dashboard", href: "/dashboard", icon: LuLayoutDashboard },
  { labelKey: "settings", href: "/settings", icon: LuSettings },
] as const;

function renderShell() {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <AppShell
        navItems={navItems}
        navNamespace="nav"
        homeHref="/dashboard"
        identity={{ name: "Jane", initials: "J", roleLabel: "Owner" }}
        profileHref="/settings?tab=profile"
      >
        <p>content</p>
      </AppShell>
    </NextIntlClientProvider>,
  );
}

beforeEach(() => {
  window.matchMedia = vi.fn().mockReturnValue({
    matches: false,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }) as never;
});

describe.each(["desktop", "mobile"] as const)("AppShell (%s)", (kind) => {
  beforeEach(() => {
    breakpoint.value = kind;
  });

  // Two `main` landmarks (the sidebar inset used to be one too) leave a screen-reader user with no clear "main content".
  test("has exactly one main landmark, holding the page content", () => {
    renderShell();

    const mains = screen.getAllByRole("main");
    expect(mains).toHaveLength(1);
    expect(mains[0]).toHaveAttribute("id", "main-content");
    expect(within(mains[0]!).getByText("content")).toBeInTheDocument();
  });

  test("offers a skip link to it that is the first thing a keyboard reaches", () => {
    renderShell();

    const skip = screen.getByRole("link", { name: messages.appShell.skipToContent });
    expect(skip).toHaveAttribute("href", "#main-content");
    expect(document.body.querySelector("a")).toBe(skip);
  });

  test("names the current page's link and marks it current", () => {
    renderShell();

    const current = screen
      .getAllByRole("link", { name: messages.nav.settings })
      .find((link) => link.getAttribute("aria-current") === "page");
    expect(current).toBeDefined();
    expect(
      screen
        .getAllByRole("link", { name: messages.nav.dashboard })
        .every((link) => link.getAttribute("aria-current") === null),
    ).toBe(true);
  });
});
