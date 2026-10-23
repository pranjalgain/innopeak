import type { ReactNode } from "react";

import { cn } from "@/app/_libs/utils/cn";

interface FieldErrorProps {
  /** Referenced from the input's `aria-describedby`, so the message is read with the field and not only when it appears. */
  id: string;
  className?: string;
  children: ReactNode;
}

/** A form field's validation message. `role="alert"` announces it the moment it appears, which a bare `<p>` never was. */
export function FieldError({ id, className, children }: FieldErrorProps) {
  return (
    <p id={id} role="alert" className={cn("text-destructive text-[12.5px]", className)}>
      {children}
    </p>
  );
}
