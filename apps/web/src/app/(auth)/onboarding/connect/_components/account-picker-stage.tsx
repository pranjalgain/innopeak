import { useTranslations } from "next-intl";
import { useId } from "react";
import { LuBuilding2 } from "react-icons/lu";

import type { PendingAccount } from "@/app/_libs/services/connection.service";
import { cn } from "@/app/_libs/utils/cn";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

interface AccountPickerStageProps {
  accounts: PendingAccount[];
  selectedAccountId: string | null;
  onSelect: (accountId: string) => void;
  onContinue: () => void;
  isSubmitting?: boolean;
}

const KNOWN_TYPES = ["PERSONAL", "LOCATION_GROUP", "USER_GROUP", "ORGANIZATION"] as const;

/**
 * Shown when the Google login manages several Business Profile accounts (a personal one plus a location group, or an
 * agency's). Nothing is preselected: connecting the wrong account is worse than one extra click.
 */
export function AccountPickerStage({
  accounts,
  selectedAccountId,
  onSelect,
  onContinue,
  isSubmitting = false,
}: AccountPickerStageProps) {
  const t = useTranslations("onboardingConnect.accountPicker");
  const titleId = useId();

  const typeLabel = (type: string | null): string | null =>
    type !== null && (KNOWN_TYPES as readonly string[]).includes(type)
      ? t(`types.${type as (typeof KNOWN_TYPES)[number]}`)
      : null;

  return (
    <div className="animate-in fade-in slide-in-from-right-2 flex flex-col items-center gap-4 text-center duration-300 ease-fluid">
      <div className="flex size-14 shrink-0 items-center justify-center rounded-full bg-accent">
        <LuBuilding2 className="size-6 text-primary" />
      </div>
      <div className="flex flex-col gap-1">
        <h1 id={titleId} className="text-gradient text-lg font-semibold">
          {t("title")}
        </h1>
        <p className="text-[13px] text-muted-foreground">{t("subtitle")}</p>
      </div>

      <RadioGroup
        aria-labelledby={titleId}
        value={selectedAccountId ?? ""}
        onValueChange={onSelect}
        className="w-full gap-2"
      >
        {accounts.map((account) => {
          const isSelected = account.accountId === selectedAccountId;
          const label = typeLabel(account.type);
          return (
            <label key={account.accountId} className="flex w-full cursor-pointer items-center gap-3">
              <RadioGroupItem value={account.accountId} className="shrink-0" />
              <Card
                className={cn(
                  "min-w-0 flex-1 flex-row items-center gap-3 rounded-md border-[1.5px] p-3.5 text-left shadow-none transition-colors duration-150 ease-fluid",
                  isSelected ? "border-primary bg-accent" : "border-border bg-card",
                )}
              >
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="truncate text-sm font-medium">{account.name ?? t("unnamed")}</span>
                  {label !== null ? (
                    <span className="text-[13px] text-muted-foreground">{label}</span>
                  ) : null}
                </div>
              </Card>
            </label>
          );
        })}
      </RadioGroup>

      <Button
        type="button"
        size="block"
        onClick={onContinue}
        disabled={isSubmitting || selectedAccountId === null}
      >
        {t("button")}
      </Button>
    </div>
  );
}
