import { useTranslations } from "next-intl";
import { LuCheck, LuX } from "react-icons/lu";

import { cn } from "@/app/_libs/utils/cn";

export interface PasswordRequirements {
  minLength: boolean;
  uppercase: boolean;
  number: boolean;
}

export function checkPasswordRequirements(password: string): PasswordRequirements {
  return {
    minLength: password.length >= 8,
    uppercase: /[A-Z]/.test(password),
    number: /[0-9]/.test(password),
  };
}

export function passwordMeetsRequirements(requirements: PasswordRequirements): boolean {
  return requirements.minLength && requirements.uppercase && requirements.number;
}

interface PasswordRequirementsListProps {
  requirements: PasswordRequirements;
}

/** Live checklist below a password field — same check/cross treatment `DoneStage`'s success circle uses. */
export function PasswordRequirementsList({ requirements }: PasswordRequirementsListProps) {
  const t = useTranslations("common.passwordRequirements");

  const rows: { key: keyof PasswordRequirements; label: string }[] = [
    { key: "minLength", label: t("minLength") },
    { key: "uppercase", label: t("uppercase") },
    { key: "number", label: t("number") },
  ];

  return (
    <ul className="flex flex-col gap-1">
      {rows.map((row) => {
        const met = requirements[row.key];
        const Icon = met ? LuCheck : LuX;
        return (
          <li
            key={row.key}
            className={cn(
              "flex items-center gap-1.5 text-[12.5px] transition-colors duration-150 ease-fluid",
              met ? "text-success" : "text-muted-foreground",
            )}
          >
            <Icon className="size-3" />
            {row.label}
          </li>
        );
      })}
    </ul>
  );
}
