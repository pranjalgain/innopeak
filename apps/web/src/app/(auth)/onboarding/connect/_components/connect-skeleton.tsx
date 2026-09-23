import { Skeleton } from "@/components/ui/skeleton";

/**
 * Loading placeholder for the "checking" and "loading_locations" stages, shaped like the actual
 * content those stages resolve into (`ConnectStage`/`ConfirmLocationStage`: an icon circle, a
 * title, a subtitle, then a couple of location-card-shaped rows) — not `ShellSkeleton`, which is
 * a full app-shell placeholder (sidebar rail + header bar) meant for route guards. Reusing that
 * one here rendered a sidebar-shaped skeleton squeezed into this narrow, centered ~480px card,
 * matching none of the layouts it was standing in for.
 */
export function ConnectSkeleton() {
  return (
    <div className="flex flex-col items-center gap-4 text-center">
      <Skeleton className="size-14 shrink-0 rounded-full" />
      <div className="flex flex-col items-center gap-2">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-3.5 w-56" />
      </div>
      <div className="flex w-full flex-col gap-2">
        <Skeleton className="h-16 w-full rounded-md" />
        <Skeleton className="h-16 w-full rounded-md" />
      </div>
    </div>
  );
}
