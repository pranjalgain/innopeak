"use client";

import { useTranslations } from "next-intl";
import * as React from "react";
import { LuEye, LuEyeOff } from "react-icons/lu";

import { cn } from "@/app/_libs/utils/cn";
import { Input } from "@/components/ui/input";

type PasswordInputProps = Omit<React.ComponentProps<typeof Input>, "type">;

/** A password `Input` with a show/hide toggle — reveals plain text on click instead of masking it forever. */
export function PasswordInput({ className, ...props }: PasswordInputProps) {
  const t = useTranslations("common.passwordInput");
  const [visible, setVisible] = React.useState(false);
  const Icon = visible ? LuEyeOff : LuEye;

  return (
    <div className="relative">
      <Input type={visible ? "text" : "password"} className={cn("pr-9", className)} {...props} />
      <button
        type="button"
        onClick={() => setVisible((prev) => !prev)}
        tabIndex={-1}
        aria-label={visible ? t("hide") : t("show")}
        className="absolute top-1/2 right-2.5 -translate-y-1/2 text-muted-foreground transition-colors ease-fluid hover:text-foreground"
      >
        <Icon className="size-4" />
      </button>
    </div>
  );
}
