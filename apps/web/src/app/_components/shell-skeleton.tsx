import { Skeleton } from "@/components/ui/skeleton";

/**
 * Shell-shaped skeleton (sidebar rail + header bar + content) shown by
 * route guards (`GoogleConnectionGuard`, `AdminGuard`) while their access
 * check is loading, so the whole app doesn't blank out to `null` on every
 * load. Deliberately not the real `AppShell` — that pulls in i18n/auth/
 * breakpoint context a guard shouldn't need just to render a placeholder.
 */
export function ShellSkeleton() {
  return (
    <div className="flex min-h-dvh">
      <div className="hidden w-64 shrink-0 flex-col gap-6 border-r border-border p-4 lg:flex">
        <Skeleton className="h-9 w-32" />
        <div className="flex flex-col gap-2">
          <Skeleton className="h-9 w-full rounded-md" />
          <Skeleton className="h-9 w-full rounded-md" />
          <Skeleton className="h-9 w-full rounded-md" />
          <Skeleton className="h-9 w-full rounded-md" />
        </div>
      </div>
      <div className="flex flex-1 flex-col">
        <div className="flex h-14 items-center border-b border-border px-4">
          <Skeleton className="h-6 w-40" />
        </div>
        <div className="flex flex-col gap-6 p-fluid-page">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-64 w-full rounded-xl" />
        </div>
      </div>
    </div>
  );
}
