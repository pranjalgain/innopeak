"use client";

import { useState } from "react";
import { LuEllipsisVertical } from "react-icons/lu";

import { ConfirmActionDialog } from "@/components/common/confirm-action-dialog";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface SecondaryRowAction {
  label: string;
  variant?: "default" | "destructive";
  confirmTitle: string;
  confirmDescription: string;
  confirmLabel: string;
  destructive?: boolean;
  onConfirm: () => void;
}

interface RowActionsMenuProps {
  ariaLabel: string;
  actionLabel: string;
  actionVariant?: "default" | "destructive";
  confirmTitle: string;
  confirmDescription: string;
  confirmLabel: string;
  cancelLabel: string;
  destructive?: boolean;
  onConfirm: () => void;
  secondaryAction?: SecondaryRowAction;
}

/** The confirm dialog is a sibling of `DropdownMenu`, not nested in `DropdownMenuContent`; see `ConfirmActionDialog`. */
export function RowActionsMenu({
  ariaLabel,
  actionLabel,
  actionVariant,
  confirmTitle,
  confirmDescription,
  confirmLabel,
  cancelLabel,
  destructive,
  onConfirm,
  secondaryAction,
}: RowActionsMenuProps) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [secondaryConfirmOpen, setSecondaryConfirmOpen] = useState(false);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button type="button" variant="ghost" size="icon" aria-label={ariaLabel}>
            <LuEllipsisVertical className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem variant={actionVariant} onSelect={() => setConfirmOpen(true)}>
            {actionLabel}
          </DropdownMenuItem>
          {secondaryAction ? (
            <DropdownMenuItem
              variant={secondaryAction.variant}
              onSelect={() => setSecondaryConfirmOpen(true)}
            >
              {secondaryAction.label}
            </DropdownMenuItem>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>

      <ConfirmActionDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={confirmTitle}
        description={confirmDescription}
        confirmLabel={confirmLabel}
        cancelLabel={cancelLabel}
        destructive={destructive}
        onConfirm={onConfirm}
      />

      {secondaryAction ? (
        <ConfirmActionDialog
          open={secondaryConfirmOpen}
          onOpenChange={setSecondaryConfirmOpen}
          title={secondaryAction.confirmTitle}
          description={secondaryAction.confirmDescription}
          confirmLabel={secondaryAction.confirmLabel}
          cancelLabel={cancelLabel}
          destructive={secondaryAction.destructive}
          onConfirm={secondaryAction.onConfirm}
        />
      ) : null}
    </>
  );
}
