"use client";

import { cloneElement, type ReactElement, useState } from "react";

import { cn } from "@/app/_libs/utils/cn";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface ConfirmActionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: () => void;
  /** Styles the confirm button as destructive (e.g. suspend/deactivate) instead of the default. */
  destructive?: boolean;
}

/**
 * A confirm-before-you-act dialog for actions that change something's state
 * (suspend/reactivate a business, activate/deactivate a user) — controlled
 * (`open`/`onOpenChange`) rather than taking a `trigger` to wrap, and rendered
 * as a sibling of whatever opens it (never nested inside a `DropdownMenuContent`):
 * a dropdown menu unmounts its content after its own close animation even when
 * `onSelect` closes it "immediately," and a `AlertDialog` root living inside that
 * subtree gets unmounted along with it moments after opening — this looks like the
 * confirm dialog "closing itself" for no reason. Keeping this dialog outside the
 * menu's subtree avoids that entirely.
 */
export function ConfirmActionDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  cancelLabel,
  onConfirm,
  destructive,
}: ConfirmActionDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{cancelLabel}</AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            className={cn(destructive && "bg-destructive text-white hover:bg-destructive/90")}
          >
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

interface ConfirmActionButtonProps extends Omit<ConfirmActionDialogProps, "open" | "onOpenChange"> {
  /** A single element (usually a `Button`) cloned to open the dialog on click. */
  trigger: ReactElement<{ onClick?: () => void }>;
}

/**
 * Convenience wrapper for the common case: a plain, always-visible button that opens the confirm
 * dialog. NOT for a trigger nested inside something that can unmount around it (a
 * `DropdownMenuItem`) — see `ConfirmActionDialog`'s own doc comment for why that case needs the
 * controlled dialog rendered as a sibling of the menu instead.
 */
export function ConfirmActionButton({ trigger, ...dialogProps }: ConfirmActionButtonProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      {cloneElement(trigger, { onClick: () => setOpen(true) })}
      <ConfirmActionDialog open={open} onOpenChange={setOpen} {...dialogProps} />
    </>
  );
}
