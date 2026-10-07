import { useMutation, type UseMutationResult } from "@tanstack/react-query";

import { BillingService } from "@/app/_libs/services/billing.service";
import { triggerBrowserDownload } from "@/app/_libs/utils/browser-download";

/** Saves the PDF under the server-chosen filename, so callers only handle `isPending`/`isError`. */
export function useDownloadReceiptPdf(): UseMutationResult<void, unknown, string> {
  return useMutation({
    mutationFn: async (receiptId: string) => {
      const { blob, filename } = await BillingService.downloadReceiptPdf(receiptId);
      triggerBrowserDownload(blob, filename);
    },
  });
}
