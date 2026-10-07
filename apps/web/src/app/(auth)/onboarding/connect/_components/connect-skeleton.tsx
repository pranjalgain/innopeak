import { Skeleton } from "@/components/ui/skeleton";

/** Shaped like what the checking/loading_locations stages resolve into; not `ShellSkeleton`, whose sidebar-shaped placeholder doesn't fit this narrow card. */
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
