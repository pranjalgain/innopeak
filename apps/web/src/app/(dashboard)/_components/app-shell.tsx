"use client";

import { motion } from "motion/react";
import type { Route } from "next";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
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
  children: ReactNode;
  navItems: readonly ShellNavItem[];
  navNamespace: string;
  homeHref: string;
  identity: ShellIdentity;
  profileHref: string;
  showNotifications?: boolean;
  showBusinessSwitcher?: boolean;
}

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
            {navItems.map((item) => {
              const isActive = isNavItemActive(pathname, item.href, homeHref);
              return (
              <SidebarMenuItem key={item.href}>
                {isActive && (
                  <motion.div
                    layoutId="sidebar-active-indicator"
                    transition={{ type: "spring", stiffness: 380, damping: 32 }}
                    className="absolute inset-y-0 left-0 w-[2px] bg-primary group-data-[collapsible=icon]:hidden"
                  />
                )}
                <SidebarMenuButton
                  asChild
                  isActive={isActive}
                  tooltip={t(item.labelKey)}
                  // `group/navitem` is a named group so `data-active` drives the children's classes without
                  // colliding with the Sidebar root's unnamed `group`. The active `scale-*` classes live on the
                  // children, not as `[&>svg]:` brackets here: a `group-data-[...]/navitem:[&>x]:` class on the
                  // element carrying `group/navitem` requires it to be its own descendant and never matches.
                  // Icon size stays here because a class on `<item.icon>` loses to the variant's parent-scoped `[&>svg]:size-4`.
                  className="group/navitem h-9 rounded-none pl-[10px] text-sm [&>svg]:size-4.5 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:rounded-md group-data-[collapsible=icon]:[&>svg]:size-5"
                >
                  <Link href={item.href as Route}>
                    {/* `scale-*`, not a bigger size: a transform never affects the layout box, so siblings can't shift.
                        `backface-hidden` + `will-change` force layer promotion; otherwise the icon is rasterized per
                        frame during the transition and looks hazy until it settles. */}
                    <item.icon className="scale-100 backface-hidden transition-transform ease-fluid will-change-[transform,scale] group-data-[active=true]/navitem:scale-110" />
                    {/* `inline-block`: transforms have no effect on a plain inline `<span>`. Same layer promotion as the icon. */}
                    <span className="inline-block scale-100 backface-hidden transition-transform ease-fluid will-change-[transform,scale] group-data-[active=true]/navitem:scale-105 group-data-[collapsible=icon]:hidden">
                      {t(item.labelKey)}
                    </span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              );
            })}
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
