import { useTranslations } from "next-intl";
import { useState } from "react";
import { LuMapPin } from "react-icons/lu";

import type { ConnectedLocation } from "@/app/_libs/services/connection.service";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useSetActiveLocation } from "@/hooks/billing/use-set-active-location";

interface ChooseActiveLocationCardProps {
  /** Already filtered to `status === "active"` by the caller (`useBusinessSwitcher`). */
  locations: ConnectedLocation[];
  /** True while showing this ahead of an actual downgrade (`cancelAtPeriodEnd`) — same section,
   *  different copy, per the plan's §3a "proactive vs reactive" framing. */
  proactive: boolean;
  maxLocations: number;
}

/**
 * Shown when a tenant holds more connected locations than their plan now allows — reading each
 * location's real `billingPausedAt` from `GET /v1/connections/locations`
 * (`ConnectionService.listLocations`, via `BillingSettingsSection`'s `useBusinessSwitcher` call)
 * for its active/paused badge and default selection.
 */
export function ChooseActiveLocationCard({
  locations: connectedLocations,
  proactive,
  maxLocations,
}: ChooseActiveLocationCardProps) {
  const t = useTranslations("settings.billing.chooseLocation");
  const { setActiveLocation, isUpdating } = useSetActiveLocation();

  // `billingPausedAt === null` is the actual billing-pause bookkeeping
  // (`locations.billing_paused_at`), not an approximation — see `ConnectedLocation`'s own comment.
  const currentlyActiveId =
    connectedLocations.find((location) => location.billingPausedAt === null)?.id ?? null;
  const [selected, setSelected] = useState<string | null>(currentlyActiveId);

  return (
    <Card className="animate-in fade-in slide-in-from-bottom-2 fill-mode-backwards ease-fluid motion-reduce:animate-none duration-500">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <LuMapPin className="text-primary size-4" />
          {t("title")}
        </CardTitle>
        <CardDescription>
          {t(proactive ? "proactiveDescription" : "reactiveDescription", { count: maxLocations })}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <RadioGroup value={selected ?? undefined} onValueChange={setSelected}>
          {connectedLocations.map((location) => (
            <div key={location.id} className="flex items-start gap-2.5">
              <RadioGroupItem value={location.id} id={`billing-location-${location.id}`} className="mt-0.5" />
              <Label
                htmlFor={`billing-location-${location.id}`}
                className="flex flex-col items-start gap-0.5 font-normal">
                <span className="text-sm font-medium">{location.businessName}</span>
                {location.address ? (
                  <span className="text-muted-foreground text-[12.5px]">{location.address}</span>
                ) : null}
                {location.billingPausedAt === null ? (
                  <span className="text-success text-[12px] font-medium">{t("currentlyActive")}</span>
                ) : (
                  <span className="text-muted-foreground text-[12px] font-medium">{t("paused")}</span>
                )}
              </Label>
            </div>
          ))}
        </RadioGroup>
        <Button
          type="button"
          className="w-fit"
          disabled={!selected || isUpdating}
          onClick={() => {
            if (selected) void setActiveLocation(selected);
          }}>
          {t("confirm")}
        </Button>
      </CardContent>
    </Card>
  );
}
