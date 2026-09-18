"use client";

import type { Route } from "next";
import { useRouter } from "next/navigation";

import { useFormatter, useTranslations } from "next-intl";
import { useState } from "react";
import { LuStore } from "react-icons/lu";


import { ROUTES } from "@/app/_libs/constants/routes";
import { ConnectionService } from "@/app/_libs/services/connection.service";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useBusinessSwitcher } from "@/hooks/connections/use-business-switcher";
import type { ConnectionInfo } from "@/types/domain";

interface ConnectionSettingsSectionProps {
  connection: ConnectionInfo;
  onDisconnect: () => void;
}

const DATE_FORMAT = {
  month: "short",
  day: "numeric",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
} as const;

export function ConnectionSettingsSection({
  connection,
  onDisconnect,
}: ConnectionSettingsSectionProps) {
  const t = useTranslations("settings.connection");
  const format = useFormatter();
  const router = useRouter();
  const [isConfirming, setIsConfirming] = useState(false);
  const [isRedirecting, setIsRedirecting] = useState(false);
  const isConnected = connection.status === "connected";
  // Read-only: this tab only shows what's confirmed, it doesn't switch between them (that's the
  // header's BusinessSwitcher, already visible on this page) — reusing its hook avoids a second
  // fetch of the same `["connections", "locations"]` data.
  const { locations, activeLocationId } = useBusinessSwitcher();
  const activeLocation = locations.find((location) => location.id === activeLocationId) ?? null;
  const otherLocations = locations.filter((location) => location.id !== activeLocation?.id);

  // The tile below names the active location from the SAME data that decides which locations are
  // "other", never from the `connection` prop alone. That prop comes from the `["settings"]` query,
  // a separate cached copy of the same server state, and switching business from the header's
  // BusinessSwitcher writes only `["connection"]` — so the two disagree until Settings happens to
  // refetch (5-minute staleTime, no refetch on focus). While they disagreed, the just-deselected
  // location was rendered as the connected one AND listed under "other connected locations", with
  // the genuinely active one shown nowhere. Falls back to the prop whenever the locations list
  // hasn't loaded (or a single-location tenant has nothing to switch between).
  const activeBusinessName = activeLocation?.businessName ?? connection.businessName;
  const activeLastSyncedAt = activeLocation?.lastSyncedAt ?? connection.lastSyncedAt;

  // A full-page navigation into the OAuth flow, returning to this tab via the backend's
  // `?tab=connection` redirect. Previously the only way back from "disconnected" was the
  // onboarding screen, which meant Settings could break a connection but never repair one.
  const handleConnect = () => {
    setIsRedirecting(true);
    void ConnectionService.startAuthorize("settings");
  };

  return (
    <Card className="animate-in fade-in slide-in-from-bottom-2 fill-mode-backwards ease-fluid motion-reduce:animate-none duration-500">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <LuStore className="text-primary size-4" />
          {t("title")}
        </CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <div className="border-border animate-in fade-in slide-in-from-bottom-1 fill-mode-backwards ease-fluid motion-reduce:animate-none flex items-center gap-4 rounded-lg border p-4 duration-300">
          <div className="bg-accent text-accent-foreground flex size-11 shrink-0 items-center justify-center rounded-md">
            <LuStore className="size-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">{activeBusinessName}</p>
            <p className="text-muted-foreground mt-0.5 text-[13px]">
              {t("lastSynced", {
                date: format.dateTime(new Date(activeLastSyncedAt), DATE_FORMAT),
              })}
            </p>
          </div>
          <Badge
            variant="outline"
            className={
              isConnected
                ? "bg-success-soft text-success border-transparent"
                : "bg-destructive-soft text-destructive border-transparent"
            }>
            {isConnected ? t("statusConnected") : t("statusDisconnected")}
          </Badge>
        </div>

        {isConnected && otherLocations.length > 0 ? (
          <div className="flex flex-col gap-2">
            <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
              {t("otherLocations")}
            </p>
            <div className="flex flex-col gap-2">
              {otherLocations.map((location, index) => (
                <div
                  key={location.id}
                  style={{ animationDelay: `${index * 60}ms` }}
                  className="border-border animate-in fade-in slide-in-from-bottom-1 fill-mode-backwards ease-fluid motion-reduce:animate-none flex items-center gap-4 rounded-lg border p-4 duration-300">
                  <div className="bg-accent text-accent-foreground flex size-11 shrink-0 items-center justify-center rounded-md">
                    <LuStore className="size-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold">{location.businessName}</p>
                    {location.address ? (
                      <p className="text-muted-foreground mt-0.5 truncate text-[13px]">
                        {location.address}
                      </p>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {!isConnected ? (
          <div>
            <Button type="button" onClick={handleConnect} disabled={isRedirecting}>
              {isRedirecting ? t("connecting") : t("connectButton")}
            </Button>
          </div>
        ) : null}

        {isConnected && !isConfirming ? (
          <div>
            <Button
              type="button"
              variant="outline"
              className="border-destructive text-destructive hover:bg-destructive/10"
              onClick={() => setIsConfirming(true)}>
              {t("disconnectButton")}
            </Button>
          </div>
        ) : null}

        {isConnected && isConfirming ? (
          <div className="animate-in fade-in zoom-in-95 bg-destructive-soft ease-fluid flex items-center gap-3 rounded-lg px-4 py-3 duration-300">
            <p className="flex-1 text-[13px] font-medium">{t("disconnectConfirm")}</p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setIsConfirming(false)}>
              {t("cancel")}
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              onClick={() => {
                onDisconnect();
                setIsConfirming(false);
                // The (dashboard) layout's access guard is already mounted and
                // won't re-check on its own — leave immediately rather than
                // sit on a "connected-only" screen while actually disconnected.
                router.push(ROUTES.ONBOARDING_CONNECT as Route);
              }}>
              {t("disconnectButton")}
            </Button>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
