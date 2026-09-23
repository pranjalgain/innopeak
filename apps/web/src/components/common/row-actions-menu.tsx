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
}

/**
 * A single-action row menu (ghost icon-button trigger + one `DropdownMenuItem`) paired with its
 * own confirm dialog — used for admin-table rows with one confirmable state-changing action
 * (suspend/reactivate a business, activate/deactivate a user, and any future admin row with a
 * single confirmable destructive/non-destructive action).
 *
 * The confirm dialog is rendered as a sibling of `DropdownMenu`, not nested inside
 * `DropdownMenuContent` — see `ConfirmActionDialog`'s own doc comment: a dialog nested inside a
 * menu's subtree gets unmounted along with the menu once it closes, which happens moments after
 * opening even when `onSelect` closes the menu "immediately." `DropdownMenuItem`'s `onSelect` just
 * opens `confirmOpen`; Radix's default close-on-select behavior is fine here since nothing needs
 * to survive inside the menu's own subtree anymore.
 */
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
}: RowActionsMenuProps) {
  const [confirmOpen, setConfirmOpen] = useState(false);

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
    </>
  );
}
