"use client";

import { cloneElement, type ReactElement, useEffect, useRef, useState } from "react";

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
  destructive?: boolean;
  /** Pass the caller's mutation `isPending` so a double-click can't fire the action twice. Cancel stays enabled. */
  confirmDisabled?: boolean;
}

/**
 * Controlled and rendered as a sibling of whatever opens it, never inside a `DropdownMenuContent`:
 * the menu unmounts its content after its close animation, taking the `AlertDialog` with it.
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
  confirmDisabled,
}: ConfirmActionDialogProps) {
  // The dialog closes on the first click but its button stays in the DOM through the exit animation, so a quick second click
  // lands on it again. One confirmation per opening, whatever the caller's `isPending` says (it can still be false that tick).
  const confirmed = useRef(false);
  useEffect(() => {
    if (open) confirmed.current = false;
  }, [open]);

  const handleConfirm = () => {
    if (confirmed.current) return;
    confirmed.current = true;
    onConfirm();
  };

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
            onClick={handleConfirm}
            disabled={confirmDisabled}
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
  trigger: ReactElement<{ onClick?: () => void }>;
}

/** For an always-visible trigger only; not one inside something that can unmount (see `ConfirmActionDialog`). */
export function ConfirmActionButton({ trigger, ...dialogProps }: ConfirmActionButtonProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      {cloneElement(trigger, { onClick: () => setOpen(true) })}
      <ConfirmActionDialog open={open} onOpenChange={setOpen} {...dialogProps} />
    </>
  );
}
