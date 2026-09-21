import { useTranslations } from "next-intl";
import { LuCheck, LuX } from "react-icons/lu";

import {
  PASSWORD_LOWERCASE_REGEX,
  PASSWORD_MIN_LENGTH,
  PASSWORD_NUMBER_REGEX,
  PASSWORD_SPECIAL_REGEX,
  PASSWORD_UPPERCASE_REGEX,
} from "@/app/_libs/constants/password-rules";
import { cn } from "@/app/_libs/utils/cn";

export interface PasswordRequirements {
  minLength: boolean;
  uppercase: boolean;
  lowercase: boolean;
  number: boolean;
  special: boolean;
}

/**
 * Evaluates each rule from `@/app/_libs/constants/password-rules` — the same constants the zod
 * form schemas validate against, so the checklist can never show all-green for a password the
 * schema (or the API behind it) will reject.
 */
export function checkPasswordRequirements(password: string): PasswordRequirements {
  return {
    minLength: password.length >= PASSWORD_MIN_LENGTH,
    uppercase: PASSWORD_UPPERCASE_REGEX.test(password),
    lowercase: PASSWORD_LOWERCASE_REGEX.test(password),
    number: PASSWORD_NUMBER_REGEX.test(password),
    special: PASSWORD_SPECIAL_REGEX.test(password),
  };
}

export function passwordMeetsRequirements(requirements: PasswordRequirements): boolean {
  return (
    requirements.minLength &&
    requirements.uppercase &&
    requirements.lowercase &&
    requirements.number &&
    requirements.special
  );
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
    { key: "lowercase", label: t("lowercase") },
    { key: "number", label: t("number") },
    { key: "special", label: t("special") },
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
