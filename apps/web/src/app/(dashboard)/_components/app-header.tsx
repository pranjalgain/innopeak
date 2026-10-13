import type { Route } from "next";
import Link from "next/link";
import { useTranslations } from "next-intl";

import { BusinessSwitcher } from "@/app/(dashboard)/_components/business-switcher";
import { NotificationPanel } from "@/app/(dashboard)/_components/notification-panel";
import type { ShellIdentity } from "@/app/(dashboard)/_components/shell-nav";
import { LanguageSwitcher } from "@/app/_components/language-switcher";
import { ThemeToggle } from "@/app/_components/theme-toggle";
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
  profileHref: string;
  /** Off for the Super Admin shell — review-escalation notifications are a tenant concept. */
  showNotifications?: boolean;
  /** Off for the Super Admin shell: the switcher reads the tenant-scoped `GET /v1/connections`, which 403s for a platform-admin token. */
  showBusinessSwitcher?: boolean;
  /** Off whenever a sidebar is on screen, since its footer already has this menu; only mobile needs it here. */
  showAccountMenu?: boolean;
}

export function AppHeader({
  title,
  identity,
  profileHref,
  showNotifications = true,
  showBusinessSwitcher = true,
  showAccountMenu = true,
}: AppHeaderProps) {
  const t = useTranslations("appShell");
  const { logout } = useAuth();

  return (
    <header className="flex h-15 shrink-0 items-center justify-between gap-2 border-b border-border px-4 sm:px-6">
      {/* `min-w-0` + `truncate`: a flex item won't shrink below its text, so a long title (German "Bewertungswarteschlange")
          pushed the controls off the edge of a phone. */}
      <h2 className="min-w-0 truncate text-base font-semibold" title={title}>
        {title}
      </h2>

      <div className="flex shrink-0 items-center gap-2">
        {showBusinessSwitcher ? <BusinessSwitcher /> : null}
        <LanguageSwitcher />
        <ThemeToggle />
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
