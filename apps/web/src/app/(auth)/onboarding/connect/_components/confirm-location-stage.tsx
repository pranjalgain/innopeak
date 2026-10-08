import { motion, useMotionValue, useReducedMotion, useSpring } from "motion/react";
import { useTranslations } from "next-intl";
import { type PointerEvent, useId } from "react";
import { LuMapPin } from "react-icons/lu";

import type { AvailableLocation } from "@/app/_libs/services/connection.service";
import { cn } from "@/app/_libs/utils/cn";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

interface ConfirmLocationStageProps {
  locations: AvailableLocation[];
  selectedLocationIds: string[];
  /** The plan has room for one location only (Free): pick one with radio buttons instead of ticking several. */
  isSingleSelect?: boolean;
  onToggle: (externalLocationId: string) => void;
  onContinue: () => void;
  isSubmitting?: boolean;
}

/**
 * One location renders as a single card, several behind a checkbox; a franchise's account really does return several. When
 * the plan only has room for one (`isSingleSelect`) the several become a radio group, so the limit is visible up front rather
 * than a rejection on Continue.
 */
export function ConfirmLocationStage({
  locations,
  selectedLocationIds,
  isSingleSelect = false,
  onToggle,
  onContinue,
  isSubmitting = false,
}: ConfirmLocationStageProps) {
  const t = useTranslations("onboardingConnect.confirmLocation");
  const isSingle = locations.length === 1;
  const titleId = useId();
  const selectedCount = selectedLocationIds.length;

  return (
    <div className="animate-in fade-in slide-in-from-right-2 flex flex-col items-center gap-4 text-center duration-300 ease-fluid">
      <div className="flex size-14 shrink-0 items-center justify-center rounded-full bg-accent">
        <LuMapPin className="size-6 text-primary" />
      </div>
      <div className="flex flex-col gap-1">
        <h1 id={titleId} className="text-gradient text-lg font-semibold">
          {t("title")}
        </h1>
        <p className="text-[13px] text-muted-foreground">
          {isSingle
            ? t("subtitle")
            : isSingleSelect
              ? t("subtitleSingleChoice")
              : t("subtitleMultiple")}
        </p>
      </div>

      {isSingle ? (
        <LocationCard location={locations[0]} isSelected />
      ) : isSingleSelect ? (
        <RadioGroup
          aria-labelledby={titleId}
          value={selectedLocationIds[0] ?? ""}
          onValueChange={onToggle}
          className="w-full gap-2"
        >
          {locations.map((location) => (
            <label
              key={location.externalLocationId}
              className="flex w-full cursor-pointer items-center gap-3"
            >
              <RadioGroupItem value={location.externalLocationId} className="shrink-0" />
              <LocationCard
                location={location}
                isSelected={selectedLocationIds.includes(location.externalLocationId)}
                className="w-auto min-w-0 flex-1"
              />
            </label>
          ))}
        </RadioGroup>
      ) : (
        <div className="flex w-full flex-col gap-2">
          {locations.map((location) => {
            const isSelected = selectedLocationIds.includes(location.externalLocationId);
            return (
              <label
                key={location.externalLocationId}
                className="flex w-full cursor-pointer items-center gap-3"
              >
                <Checkbox
                  checked={isSelected}
                  onCheckedChange={() => onToggle(location.externalLocationId)}
                  className="shrink-0"
                />
                {/* `flex-1 min-w-0`, not `w-full`: as a flex sibling of the checkbox, `w-full` adds the checkbox and `gap-3` widths
                    on top and pushes the card past the row's right edge. */}
                <LocationCard location={location} isSelected={isSelected} className="w-auto min-w-0 flex-1" />
              </label>
            );
          })}
        </div>
      )}

      <Button
        type="button"
        size="block"
        onClick={onContinue}
        disabled={isSubmitting || selectedCount === 0}
      >
        {isSingle || selectedCount <= 1 ? t("button") : t("buttonMultiple", { count: selectedCount })}
      </Button>
    </div>
  );
}

function LocationCard({
  location,
  isSelected,
  className,
}: {
  location: AvailableLocation | undefined;
  isSelected: boolean;
  className?: string;
}) {
  const t = useTranslations("onboardingConnect.confirmLocation");
  const shouldReduceMotion = useReducedMotion();

  const rotateX = useMotionValue(0);
  const rotateY = useMotionValue(0);
  const springRotateX = useSpring(rotateX, { stiffness: 300, damping: 20 });
  const springRotateY = useSpring(rotateY, { stiffness: 300, damping: 20 });

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (shouldReduceMotion) return;
    const rect = event.currentTarget.getBoundingClientRect();
    // -0.5..0.5 across the card, translated into a small tilt away from the cursor.
    const px = (event.clientX - rect.left) / rect.width - 0.5;
    const py = (event.clientY - rect.top) / rect.height - 0.5;
    rotateY.set(px * 8);
    rotateX.set(py * -8);
  };

  const handlePointerLeave = () => {
    rotateX.set(0);
    rotateY.set(0);
  };

  if (!location) return null;

  return (
    <motion.div
      onPointerMove={handlePointerMove}
      onPointerLeave={handlePointerLeave}
      whileHover={shouldReduceMotion ? undefined : { scale: 1.015 }}
      style={{ perspective: 600 }}
      className={cn("w-full", className)}
    >
      <motion.div style={{ rotateX: springRotateX, rotateY: springRotateY }}>
        <Card
          className={cn(
            "flex-row items-center gap-3 rounded-md border-[1.5px] p-3.5 text-left shadow-none transition-colors duration-150 ease-fluid",
            isSelected ? "border-primary bg-accent" : "border-border bg-card",
          )}
        >
          <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-card">
            <LuMapPin className="size-4.5 text-primary" />
          </div>
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <div className="flex items-center gap-2">
              {/* `min-w-0` here, not only on ancestors: a flex child's default min-width is its content width, so otherwise
                  `truncate` never engages and a long name pushes the badge out. */}
              <span className="min-w-0 flex-1 truncate text-sm font-medium">{location.name}</span>
              {location.alreadyConnected && (
                <Badge
                  variant="outline"
                  className="shrink-0 border-transparent bg-success-soft text-success"
                >
                  {t("alreadyConnected")}
                </Badge>
              )}
            </div>
            {/* A service-area business genuinely has no address — say so rather than rendering a blank line. */}
            <span className="text-[13px] text-muted-foreground">
              {location.address ?? t("noAddress")}
            </span>
          </div>
        </Card>
      </motion.div>
    </motion.div>
  );
}
