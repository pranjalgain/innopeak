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
 * Only renders once there is something to switch *between* — a single-location tenant (still the
 * common case) has no decision to make, and a dropdown with exactly one option reads as broken UI
 * rather than a real choice. Mirrors `ConfirmLocationStage`'s own single-location fallback.
 *
 * `tenants.active_location_id` is one shared value for the whole tenant, so every member sees the
 * same selection here — this isn't a personal "which store am I looking at" toggle, it's changing
 * what the whole team's Dashboard/Review Queue currently shows.
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
          className="max-w-40 justify-start gap-1.5 sm:max-w-56"
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
