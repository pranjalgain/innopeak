import type { QueryClient } from "@tanstack/react-query";

/**
 * The review queue list (`["reviews", "queue", …]`) and the dashboard (`["dashboard", …]`) show things a review's own screen can change: its
 * status (removed on Google, responded), its reply and the pending/escalated counts. Those caches are kept for a minute, so without this
 * a person who acts on a review and goes back sees the old state until the cache ages out. Marking them stale makes the list that mounts
 * next fetch fresh data; a list that is not on screen costs nothing.
 */
export function invalidateReviewLists(queryClient: QueryClient): void {
  void queryClient.invalidateQueries({ queryKey: ["reviews"] });
  void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
}
