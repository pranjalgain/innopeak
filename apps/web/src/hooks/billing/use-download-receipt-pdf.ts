import { useMutation, type UseMutationResult } from "@tanstack/react-query";

import { BillingService } from "@/app/_libs/services/billing.service";

/** Saves the fetched PDF `Blob` to disk via a throwaway `<a download>` — the standard
 *  browser-download trick, since there is no real URL to `window.open()` (the PDF is
 *  generated fresh from a `Blob` response, not hosted anywhere). */
function triggerBrowserDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Deferred, not revoked inline: Chrome starts the download synchronously on click, but a browser
  // that defers the fetch to a later task (Safari has historically done so) would find the blob
  // URL already dead and drop the download silently — the mutation still resolves, so nothing
  // would surface the failure.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/** `GET /v1/billing/receipts/:id/pdf` — fetches the PDF and immediately saves it under the
 *  server-chosen filename, so callers only need to handle `isPending`/`isError` for their own
 *  loading/error UI. */
export function useDownloadReceiptPdf(): UseMutationResult<void, unknown, string> {
  return useMutation({
    mutationFn: async (receiptId: string) => {
      const { blob, filename } = await BillingService.downloadReceiptPdf(receiptId);
      triggerBrowserDownload(blob, filename);
    },
  });
}
