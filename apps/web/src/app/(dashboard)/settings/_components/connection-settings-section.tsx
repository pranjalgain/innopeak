"use client";

import type { Route } from "next";
import { useRouter } from "next/navigation";

import { useFormatter, useTranslations } from "next-intl";
import { useState } from "react";
import { LuStore } from "react-icons/lu";


import { ROUTES } from "@/app/_libs/constants/routes";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useBusinessSwitcher } from "@/hooks/connections/use-business-switcher";
import { useConnectionAuthorize } from "@/hooks/connections/use-connection-authorize";
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
  const { isRedirecting, startAuthorize } = useConnectionAuthorize();
  const isConnected = connection.status === "connected";
  // Read-only; reuses the header switcher's hook to avoid a second fetch of the same locations data.
  const { locations, activeLocationId } = useBusinessSwitcher();
  const activeLocation = locations.find((location) => location.id === activeLocationId) ?? null;
  const otherLocations = locations.filter((location) => location.id !== activeLocation?.id);

  // Name the active location from the same data that decides the "other" list, not the `connection` prop: that comes
  // from the separate ["settings"] query, which disagrees with ["connection"] after a header switch until Settings
  // refetches. Falls back to the prop when locations haven't loaded.
  const activeBusinessName = activeLocation?.businessName ?? connection.businessName;
  const activeLastSyncedAt = activeLocation?.lastSyncedAt ?? connection.lastSyncedAt;

  // Full-page navigation into the OAuth flow, returning via the backend's `?tab=connection` redirect.
  const handleConnect = () => startAuthorize("settings");

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
                // The (dashboard) layout's access guard won't re-check on its own; leave immediately rather than sit on a
                // connected-only screen while disconnected.
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
