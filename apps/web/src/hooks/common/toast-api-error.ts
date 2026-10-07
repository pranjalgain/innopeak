import { toast } from "sonner";

import { ApiError } from "@/app/_libs/services/api-error";

/** Error toast for a failed mutation: a mapped status shows a fixed message or (`null`) the server's own `error.message`; anything else shows `fallback`. */
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
