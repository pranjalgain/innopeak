"use client";

import type { Route } from "next";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { LuChevronDown } from "react-icons/lu";

import { AppHeader } from "@/app/(dashboard)/_components/app-header";
import { MobileBottomNav } from "@/app/(dashboard)/_components/mobile-bottom-nav";
import { isNavItemActive, type ShellIdentity, type ShellNavItem } from "@/app/(dashboard)/_components/shell-nav";
import { InnoPeakDiamondMark } from "@/assets/icons/innopeak-diamond-mark";
import { InnoPeakLogo } from "@/assets/icons/innopeak-logo";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
} from "@/components/ui/sidebar";
import { useAuth } from "@/hooks/auth/use-auth";
import { useBreakpoint } from "@/hooks/common/use-breakpoint";

function Logo({ homeHref }: { homeHref: string }) {
  return (
    <Link
      href={homeHref as Route}
      className="flex items-center px-2 py-2 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0"
    >
      <InnoPeakLogo className="h-9 w-auto group-data-[collapsible=icon]:hidden" />
      <InnoPeakDiamondMark className="hidden h-8 w-auto group-data-[collapsible=icon]:block" />
    </Link>
  );
}

interface AppShellProps {
  children: React.ReactNode;
  /** Shared between the desktop/tablet sidebar and the mobile bottom nav, so the two can never drift. */
  navItems: readonly ShellNavItem[];
  /** i18n namespace each `navItems[].labelKey` resolves against. */
  navNamespace: string;
  homeHref: string;
  identity: ShellIdentity;
  /** Where the account menu's name/role row links to — each area's own profile settings tab. */
  profileHref: string;
  /** Off for the Super Admin shell — review-escalation notifications are a tenant concept. */
  showNotifications?: boolean;
}

/**
 * The sidebar+header shell shared by every screen behind login: full
 * labeled sidebar on desktop, icon-only rail on tablet, hidden entirely
 * (replaced by a bottom tab bar) on mobile. The header title tracks
 * whichever nav item matches the current route, so new screens under
 * `(dashboard)` or `admin` need no extra wiring here. Parameterized by
 * `navItems`/`identity` so both the tenant dashboard and the Super Admin
 * area share this one shell instead of duplicating it.
 */
export function AppShell({
  children,
  navItems,
  navNamespace,
  homeHref,
  identity,
  profileHref,
  showNotifications = true,
}: AppShellProps) {
  const t = useTranslations(navNamespace);
  const tAppShell = useTranslations("appShell");
  const { logout } = useAuth();
  const breakpoint = useBreakpoint();
  const pathname = usePathname();
  const activeItem = navItems.find((item) => isNavItemActive(pathname, item.href, homeHref));
  const title = activeItem ? t(activeItem.labelKey) : "";

  if (breakpoint === "mobile") {
    return (
      <div className="flex min-h-dvh flex-col">
        <AppHeader title={title} identity={identity} showNotifications={showNotifications} />
        <main className="min-w-0 flex-1 overflow-y-auto pb-16">{children}</main>
        <MobileBottomNav navItems={navItems} navNamespace={navNamespace} homeHref={homeHref} />
      </div>
    );
  }

  return (
    <SidebarProvider open={breakpoint === "desktop"}>
      <Sidebar collapsible="icon">
        <SidebarHeader>
          <Logo homeHref={homeHref} />
        </SidebarHeader>

        <SidebarContent>
          <SidebarMenu>
            {navItems.map((item) => (
              <SidebarMenuItem key={item.href}>
                <SidebarMenuButton
                  asChild
                  isActive={isNavItemActive(pathname, item.href, homeHref)}
                  tooltip={t(item.labelKey)}
                  className="h-9 rounded-none border-l-2 border-transparent pl-[10px] text-sm data-[active=true]:border-primary [&>svg]:size-4.5 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:border-l-0 group-data-[collapsible=icon]:[&>svg]:size-5"
                >
                  <Link href={item.href as Route}>
                    <item.icon />
                    <span className="group-data-[collapsible=icon]:hidden">{t(item.labelKey)}</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarContent>

        <SidebarFooter>
          <SidebarMenu>
            <SidebarMenuItem>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <SidebarMenuButton
                    size="lg"
                    className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
                  >
                    <Avatar className="size-8 shrink-0">
                      <AvatarFallback className="bg-accent text-xs font-medium text-accent-foreground">
                        {identity.initials}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex min-w-0 flex-1 flex-col text-left group-data-[collapsible=icon]:hidden">
                      <span className="truncate text-sm font-medium text-sidebar-foreground">{identity.name}</span>
                      <span className="truncate text-xs text-muted-foreground">{identity.roleLabel}</span>
                    </div>
                    <LuChevronDown className="ml-auto size-4 shrink-0 text-muted-foreground group-data-[collapsible=icon]:hidden" />
                  </SidebarMenuButton>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" side="top" collisionPadding={12} className="w-56">
                  <DropdownMenuItem asChild className="cursor-pointer">
                    <Link href={profileHref as Route}>
                      <div className="flex flex-col">
                        <span className="font-medium">{identity.name}</span>
                        <span className="text-xs font-normal text-muted-foreground">{identity.roleLabel}</span>
                      </div>
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={logout} className="cursor-pointer">
                    {tAppShell("signOut")}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>
      </Sidebar>

      <SidebarInset>
        <AppHeader title={title} identity={identity} showNotifications={showNotifications} showAccountMenu={false} />
        <main className="min-w-0 flex-1 overflow-y-auto">{children}</main>
      </SidebarInset>
    </SidebarProvider>
  );
}
