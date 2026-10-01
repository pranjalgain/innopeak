import type { IconType } from "react-icons";

/** Shared by `ManageBillingDialog`'s own Stripe-not-configured fallback and by
 *  `BillingProfileForm`/`UpdateCardForm`, so the three read as one consistent set of cards rather
 *  than one dialog with differently-styled sections. */
export const PANEL_CLASS = "border-border bg-muted/30 flex flex-col gap-4 rounded-lg border p-4";

/** A section's icon + label — the recurring unit every panel opens with, so the dialog reads as
 *  clearly separated cards rather than one long stacked form. */
export function PanelHeading({ icon: Icon, children }: { icon: IconType; children: string }) {
  return (
    <div className="flex items-center gap-2">
      <Icon className="text-primary size-4" />
      <p className="text-sm font-semibold">{children}</p>
    </div>
  );
}
