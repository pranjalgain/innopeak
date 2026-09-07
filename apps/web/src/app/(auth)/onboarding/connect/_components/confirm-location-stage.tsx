import { useTranslations } from "next-intl";
import { LuMapPin } from "react-icons/lu";

import type { AvailableLocation } from "@/app/_libs/services/connection.service";
import { cn } from "@/app/_libs/utils/cn";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

interface ConfirmLocationStageProps {
  locations: AvailableLocation[];
  selectedLocationId: string | null;
  onSelect: (externalLocationId: string) => void;
  onContinue: () => void;
  isSubmitting?: boolean;
}

/**
 * One location renders as today's single confirmation card; several render the same card inside a
 * radio group. The multi-location branch is not speculative — a franchise's connected account
 * really does return several, and silently taking `locations[0]` would connect the wrong store
 * with no visible recourse.
 */
export function ConfirmLocationStage({
  locations,
  selectedLocationId,
  onSelect,
  onContinue,
  isSubmitting = false,
}: ConfirmLocationStageProps) {
  const t = useTranslations("onboardingConnect.confirmLocation");
  const isSingle = locations.length === 1;

  return (
    <div className="animate-in fade-in slide-in-from-right-2 flex flex-col items-center gap-4 text-center duration-300 ease-fluid">
      <div className="flex size-14 shrink-0 items-center justify-center rounded-full bg-accent">
        <LuMapPin className="size-6 text-primary" />
      </div>
      <div className="flex flex-col gap-1">
        <h1 className="text-gradient text-lg font-semibold">{t("title")}</h1>
        <p className="text-[13px] text-muted-foreground">
          {isSingle ? t("subtitle") : t("subtitleMultiple")}
        </p>
      </div>

      {isSingle ? (
        <LocationCard location={locations[0]} isSelected />
      ) : (
        <RadioGroup
          value={selectedLocationId ?? undefined}
          onValueChange={onSelect}
          className="flex w-full flex-col gap-2"
        >
          {locations.map((location) => (
            <label
              key={location.externalLocationId}
              className="flex w-full cursor-pointer items-center gap-3"
            >
              <RadioGroupItem value={location.externalLocationId} className="shrink-0" />
              <LocationCard
                location={location}
                isSelected={location.externalLocationId === selectedLocationId}
              />
            </label>
          ))}
        </RadioGroup>
      )}

      <Button
        type="button"
        size="block"
        onClick={onContinue}
        disabled={isSubmitting || !selectedLocationId}
      >
        {t("button")}
      </Button>
    </div>
  );
}

function LocationCard({
  location,
  isSelected,
}: {
  location: AvailableLocation | undefined;
  isSelected: boolean;
}) {
  const t = useTranslations("onboardingConnect.confirmLocation");

  if (!location) return null;

  return (
    <div
      className={cn(
        "flex w-full items-center gap-3 rounded-md border-[1.5px] p-3.5 text-left transition-colors duration-150 ease-fluid",
        isSelected ? "border-primary bg-accent" : "border-border bg-card",
      )}
    >
      <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-card">
        <LuMapPin className="size-4.5 text-primary" />
      </div>
      <div className="flex flex-col gap-0.5">
        <span className="text-sm font-medium">{location.name}</span>
        {/* A service-area business genuinely has no address — say so rather than rendering a blank line. */}
        <span className="text-[13px] text-muted-foreground">{location.address ?? t("noAddress")}</span>
      </div>
    </div>
  );
}
