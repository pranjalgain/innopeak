import { toast } from "sonner";

import { ApiError } from "@/app/_libs/services/api-error";

/**
 * Shows an error toast for a failed mutation, with per-status-code overrides: a mapped status
 * shows either a fixed translated message, or (`null`) the server's own `error.message` — anything
 * else falls back to the generic `fallback` copy. Centralizes the "some status codes carry a
 * specific reason worth showing, the rest don't" branch that several mutation hooks each used to
 * hand-copy independently.
 */
export function toastApiError(
  error: unknown,
  statusMessages: Record<number, string | null>,
  fallback: string,
): void {
  if (error instanceof ApiError && error.statusCode in statusMessages) {
    const mapped = statusMessages[error.statusCode];
    toast.error(mapped === null ? error.message : mapped);
    return;
  }
  toast.error(fallback);
}
