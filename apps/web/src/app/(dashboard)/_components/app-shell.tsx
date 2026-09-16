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
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
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
  /** Where the account menu's owner-details row links to — Settings' Profile tab for the tenant
   *  shell, the Super Admin area's own profile tab for the admin one. */
  profileHref: string;
  /** Off for the Super Admin shell — review-escalation notifications are a tenant concept. */
  showNotifications?: boolean;
  /** Forwarded to `AppHeader` — see its own prop doc. */
  showBusinessSwitcher?: boolean;
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
  showBusinessSwitcher = true,
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
        <AppHeader
          title={title}
          identity={identity}
          profileHref={profileHref}
          showNotifications={showNotifications}
          showBusinessSwitcher={showBusinessSwitcher}
        />
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
                  // `group/navitem` is a *named* group — so this element's own `data-active` can
                  // drive its own children's classes below via `group-data-[...]/navitem:`,
                  // without colliding with the Sidebar root's own (unnamed) `group`, which the
                  // plain `group-data-[collapsible=icon]:` variants here still react to.
                  //
                  // The active-state `scale-*` classes below live directly on `<item.icon>`/
                  // `<span>`, not as `[&>svg]:`/`[&>span:last-child]:` brackets on this element —
                  // tried that first and it silently no-ops: a `group-data-[.../navitem:[&>x]:`
                  // class sitting on the SAME element that carries `group/navitem` + `data-active`
                  // compiles to requiring that element be a descendant of itself, which nothing
                  // ever matches. Confirmed both ways against the actual compiled CSS and rendered
                  // pixel geometry, not assumed. Icon *size* has the opposite constraint and stays
                  // up here as `[&>svg]:size-4.5` — a plain class directly on `<item.icon>` loses
                  // to the base `SidebarMenuButton` variant's own `[&>svg]:size-4`, which is
                  // parent-scoped and therefore higher specificity.
                  className="group/navitem h-9 rounded-none border-l-2 border-transparent pl-[10px] text-sm data-[active=true]:border-primary [&>svg]:size-4.5 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:rounded-md group-data-[collapsible=icon]:border-l-0 group-data-[collapsible=icon]:[&>svg]:size-5"
                >
                  <Link href={item.href as Route}>
                    {/* `scale-*` rather than a bigger `size-*`/`text-*` on active — a transform is
                        purely visual and never affects the layout box, so the row's own
                        height/width (and therefore every sibling's position) can't shift when this
                        toggles, unlike changing the icon's actual size or the text's actual
                        font-size would.
                        `backface-hidden` + `will-change-[transform,scale]` — without either, this
                        element has no compositing layer of its own, so Chromium/WebKit rasterize
                        the icon on the main thread at each intermediate frame of the scale
                        transition instead of animating a single pre-rasterized GPU layer, which
                        reads as a brief haze/blur that sharpens the instant the transition settles.
                        Confirmed via computed style before the fix (`will-change: auto`,
                        `backface-visibility: visible`, no layer) — both utilities together force
                        layer promotion up front so the whole transition renders on one already-
                        sharp texture. */}
                    <item.icon className="scale-100 backface-hidden transition-transform ease-fluid will-change-[transform,scale] group-data-[active=true]/navitem:scale-110" />
                    {/* `inline-block` — `scale`/`transform` has no visual effect on a plain
                        `inline` element (only block/inline-block/replaced elements honor it), and
                        a `<span>` defaults to inline; the icon is an `<svg>`, already a replaced
                        element, so it needs no equivalent override. Same layer-promotion pair as
                        the icon above, for the same reason — text is even more visibly affected by
                        mid-transition software rasterization than icon strokes are. */}
                    <span className="inline-block scale-100 backface-hidden transition-transform ease-fluid will-change-[transform,scale] group-data-[active=true]/navitem:scale-105 group-data-[collapsible=icon]:hidden">
                      {t(item.labelKey)}
                    </span>
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
                      {identity.avatarUrl ? <AvatarImage src={identity.avatarUrl} alt="" /> : null}
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
                      <div className="flex items-center gap-2.5">
                        <Avatar className="size-8 shrink-0">
                          {identity.avatarUrl ? <AvatarImage src={identity.avatarUrl} alt="" /> : null}
                          <AvatarFallback className="bg-accent text-xs font-medium text-accent-foreground">
                            {identity.initials}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex min-w-0 flex-col">
                          <span className="truncate font-medium">{identity.name}</span>
                          <span className="truncate text-xs font-normal text-muted-foreground">
                            {identity.roleLabel}
                          </span>
                        </div>
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
        <AppHeader
          title={title}
          identity={identity}
          profileHref={profileHref}
          showNotifications={showNotifications}
          showBusinessSwitcher={showBusinessSwitcher}
          showAccountMenu={false}
        />
        <main className="min-w-0 flex-1 overflow-y-auto">{children}</main>
      </SidebarInset>
    </SidebarProvider>
  );
}
