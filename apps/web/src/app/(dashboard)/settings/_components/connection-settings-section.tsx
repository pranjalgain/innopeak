"use client";
import type { Route } from "next";
import { useRouter } from "next/navigation";

import { useTranslations } from "next-intl";

import * as React from "react";
import { LuStore } from "react-icons/lu";

import { ROUTES } from "@/app/_libs/constants/routes";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { ConnectionInfo } from "@/types/domain";

interface ConnectionSettingsSectionProps {
  connection: ConnectionInfo;
  onDisconnect: () => void;
}

const DATE_FORMATTER = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

export function ConnectionSettingsSection({ connection, onDisconnect }: ConnectionSettingsSectionProps) {
  const t = useTranslations("settings.connection");
  const router = useRouter();
  const [isConfirming, setIsConfirming] = React.useState(false);
  const isConnected = connection.status === "connected";

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <div className="flex items-center gap-4 rounded-lg border border-border p-4">
          <div className="flex size-11 shrink-0 items-center justify-center rounded-md bg-accent text-accent-foreground">
            <LuStore className="size-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">{connection.businessName}</p>
            <p className="mt-0.5 text-[13px] text-muted-foreground">
              {t("lastSynced", { date: DATE_FORMATTER.format(new Date(connection.lastSyncedAt)) })}
            </p>
          </div>
          <Badge
            variant="outline"
            className={
              isConnected
                ? "border-transparent bg-success-soft text-success"
                : "border-transparent bg-destructive-soft text-destructive"
            }
          >
            {isConnected ? t("statusConnected") : t("statusDisconnected")}
          </Badge>
        </div>

        {isConnected && !isConfirming ? (
          <div>
            <Button
              type="button"
              variant="outline"
              className="border-destructive text-destructive hover:bg-destructive/10"
              onClick={() => setIsConfirming(true)}
            >
              {t("disconnectButton")}
            </Button>
          </div>
        ) : null}

        {isConnected && isConfirming ? (
          <div className="animate-in fade-in zoom-in-95 flex items-center gap-3 rounded-lg bg-destructive-soft px-4 py-3 duration-300 ease-fluid">
            <p className="flex-1 text-[13px] font-medium">{t("disconnectConfirm")}</p>
            <Button type="button" variant="outline" size="sm" onClick={() => setIsConfirming(false)}>
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
              }}
            >
              {t("disconnectButton")}
            </Button>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
