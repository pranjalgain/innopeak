"use client";

import { useTranslations } from "next-intl";
import { type ComponentProps, useState } from "react";

import { LuEye, LuEyeOff } from "react-icons/lu";

import { cn } from "@/app/_libs/utils/cn";
import { Input } from "@/components/ui/input";


type PasswordInputProps = Omit<ComponentProps<typeof Input>, "type">;

/** A password `Input` with a show/hide toggle — reveals plain text on click instead of masking it forever. */
export function PasswordInput({ className, ...props }: PasswordInputProps) {
  const t = useTranslations("common.passwordInput");
  const [visible, setVisible] = useState(false);
  const Icon = visible ? LuEyeOff : LuEye;

  return (
    <div className="relative">
      <Input type={visible ? "text" : "password"} className={cn("pr-10", className)} {...props} />
      <button
        type="button"
        onClick={() => setVisible((prev) => !prev)}
        // A toggle button keeps one name and says its state with `aria-pressed`; a label that flips as well reads "Hide password, pressed".
        aria-label={t("show")}
        aria-pressed={visible}
        className="text-muted-foreground ease-fluid hover:text-foreground focus-visible:ring-ring/50 absolute top-1/2 right-1 -translate-y-1/2 rounded-md p-2 transition-colors outline-none focus-visible:ring-[3px]">
        <Icon className="size-4" />
      </button>
    </div>
  );
}
