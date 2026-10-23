import { QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { ConnectionService } from "@/app/_libs/services/connection.service";
import { PlatformSettingsService } from "@/app/_libs/services/platform-settings.service";
import { SettingsService } from "@/app/_libs/services/settings.service";
import { TenantOwnerProfileService } from "@/app/_libs/services/tenant-owner-profile.service";
import { createQueryClient } from "@/app/_libs/utils/query-client";
import { SETTINGS_FIXTURE } from "@/test/fixtures/settings";

import messages from "../../../../../../messages/en.json";
import { SettingsView } from "../settings-view";

const nav = vi.hoisted(() => ({ tab: "general" as string, replace: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: nav.replace, push: vi.fn() }),
  usePathname: () => "/settings",
  useSearchParams: () => new URLSearchParams({ tab: nav.tab }),
}));

beforeEach(() => {
  nav.tab = "general";
  nav.replace.mockClear();
  Element.prototype.scrollIntoView = vi.fn();
  vi.spyOn(TenantOwnerProfileService, "get").mockResolvedValue({
    name: "Jordan Rivera",
    email: "owner@example.com",
    avatarUrl: null,
    hasPassword: true,
    businessName: "The Coastal Table",
    role: "owner",
  });
  vi.spyOn(SettingsService, "getSettings").mockResolvedValue(SETTINGS_FIXTURE);
  vi.spyOn(ConnectionService, "getState").mockResolvedValue({
    status: "connected",
    connectionId: "conn-1",
    providerAccountId: "acct-1",
    connectedAt: "2026-01-01T00:00:00Z",
    location: null,
  });
  vi.spyOn(PlatformSettingsService, "get").mockResolvedValue({
    microsoftLoginEnabled: true,
    passwordLoginEnabled: true,
    googleLoginEnabled: true,
    inviteMembersEnabled: true,
    notificationSettingsEnabled: false,
    paymentFeatureEnabled: false,
  });
});

describe("SettingsView — tabs", () => {
  // The General tab stages edits until Save; leaving its tab used to unmount it and lose them without a word.
  test("keeps unsaved General edits while another tab is open", async () => {
    const client = createQueryClient();
    const tree = (): ReactNode => (
      <QueryClientProvider client={client}>
        <NextIntlClientProvider locale="en" messages={messages}>
          <SettingsView />
        </NextIntlClientProvider>
      </QueryClientProvider>
    );
    const { rerender } = render(tree());
    const autoPost = await screen.findByRole("switch", { name: messages.settings.general.autoPost.label });
    fireEvent.click(autoPost);
    expect(autoPost).toBeChecked();

    nav.tab = "blocklist";
    rerender(tree());
    expect(screen.getByRole("tab", { name: /blocklist/i })).toHaveAttribute("data-state", "active");

    nav.tab = "general";
    rerender(tree());
    expect(
      await screen.findByRole("switch", { name: messages.settings.general.autoPost.label }),
    ).toBeChecked();
  });

  // A tab is a view of one page: an arrow-key walk along the strip must not push a history entry per key.
  test("changes tab by replacing the URL, not pushing history", async () => {
    render(
      <QueryClientProvider client={createQueryClient()}>
        <NextIntlClientProvider locale="en" messages={messages}>
          <SettingsView />
        </NextIntlClientProvider>
      </QueryClientProvider>,
    );

    fireEvent.mouseDown(await screen.findByRole("tab", { name: /blocklist/i }), { button: 0 });

    expect(nav.replace).toHaveBeenCalledWith("/settings?tab=blocklist", { scroll: false });
  });
});
