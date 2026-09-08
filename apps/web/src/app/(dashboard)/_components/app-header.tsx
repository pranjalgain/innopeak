import type { Route } from "next";
import Link from "next/link";
import { useTranslations } from "next-intl";

import { NotificationPanel } from "@/app/(dashboard)/_components/notification-panel";
import type { ShellIdentity } from "@/app/(dashboard)/_components/shell-nav";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/hooks/auth/use-auth";

interface AppHeaderProps {
  title: string;
  identity: ShellIdentity;
  /** Where the account menu's owner-details row links to — see `AppShellProps.profileHref`. */
  profileHref: string;
  /** Off for the Super Admin shell — review-escalation notifications are a tenant concept. */
  showNotifications?: boolean;
  /**
   * Off whenever a sidebar is also on screen — its footer already shows this
   * same avatar/name/role with the same sign-out menu, so showing it again
   * here would just be the identical control twice. Only mobile (no sidebar)
   * needs the header's own account menu.
   */
  showAccountMenu?: boolean;
}

/**
 * Top bar shared by every dashboard-shell screen: page title, notifications,
 * and — on mobile only — the account menu (the sidebar's footer covers it
 * everywhere else, see `showAccountMenu`).
 */
export function AppHeader({
  title,
  identity,
  profileHref,
  showNotifications = true,
  showAccountMenu = true,
}: AppHeaderProps) {
  const t = useTranslations("appShell");
  const { logout } = useAuth();

  return (
    <header className="flex h-15 shrink-0 items-center justify-between border-b border-border px-4 sm:px-6">
      <h2 className="text-base font-semibold">{title}</h2>

      <div className="flex items-center gap-2">
        {showNotifications ? <NotificationPanel /> : null}

        {showAccountMenu ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="rounded-full">
                <Avatar className="size-8">
                  {identity.avatarUrl ? <AvatarImage src={identity.avatarUrl} alt="" /> : null}
                  <AvatarFallback className="bg-accent text-xs font-medium text-accent-foreground">
                    {identity.initials}
                  </AvatarFallback>
                </Avatar>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
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
                {t("signOut")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
      </div>
    </header>
  );
}
