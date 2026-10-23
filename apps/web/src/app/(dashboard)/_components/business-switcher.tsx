"use client";

import { useTranslations } from "next-intl";
import { LuCheck, LuChevronsUpDown, LuStore } from "react-icons/lu";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useBusinessSwitcher } from "@/hooks/connections/use-business-switcher";

/**
 * Hidden for a single-location tenant: a one-option dropdown reads as broken UI. The selection is
 * shared by the whole tenant (`tenants.active_location_id`), not a personal toggle.
 */
export function BusinessSwitcher() {
  const t = useTranslations("businessSwitcher");
  const { locations, activeLocationId, isLoading, isSwitching, switchTo } = useBusinessSwitcher();

  if (isLoading || locations.length < 2) return null;

  const active = locations.find((location) => location.id === activeLocationId);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          disabled={isSwitching}
          aria-label={t("label")}
          className="max-w-28 min-w-0 justify-start gap-1.5 min-[420px]:max-w-40 sm:max-w-56"
        >
          <LuStore aria-hidden="true" className="shrink-0" />
          <span className="truncate">{active?.businessName ?? t("label")}</span>
          <LuChevronsUpDown aria-hidden="true" className="shrink-0 opacity-50" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        {locations.map((location) => (
          <DropdownMenuItem
            key={location.id}
            onClick={() => void switchTo(location.id)}
            className="cursor-pointer justify-between gap-2"
          >
            <span className="truncate">{location.businessName}</span>
            {location.id === activeLocationId ? (
              <LuCheck aria-hidden="true" className="shrink-0" />
            ) : null}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
