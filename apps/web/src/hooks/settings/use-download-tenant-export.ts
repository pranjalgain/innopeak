import { useMutation, type UseMutationResult } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { TenantExportService } from "@/app/_libs/services/tenant-export.service";
import { triggerBrowserDownload } from "@/app/_libs/utils/browser-download";
import { toastApiError } from "@/hooks/common/toast-api-error";

/**
 * Failures toast here, so callers only read `isPending`. A `Blob` request's error body is itself a
 * blob, so the server's message is unreadable; status codes pick the copy instead.
 */
export function useDownloadTenantExport(): UseMutationResult<void, unknown, void> {
  const t = useTranslations("settings.exportData.toasts");

  return useMutation({
    mutationFn: async () => {
      const { blob, filename } = await TenantExportService.download();
      triggerBrowserDownload(blob, filename);
    },
    onSuccess: () => toast.success(t("downloaded")),
    onError: (error) =>
      toastApiError(error, { 403: t("forbidden"), 429: t("tooManyRequests") }, t("failed")),
  });
}
