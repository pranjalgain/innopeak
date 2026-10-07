import type { IconType } from "react-icons";

export const PANEL_CLASS = "border-border bg-muted/30 flex flex-col gap-4 rounded-lg border p-4";

export function PanelHeading({ icon: Icon, children }: { icon: IconType; children: string }) {
  return (
    <div className="flex items-center gap-2">
      <Icon className="text-primary size-4" />
      <p className="text-sm font-semibold">{children}</p>
    </div>
  );
}
