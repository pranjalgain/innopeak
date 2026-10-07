import { settingsApi } from "@/app/_libs/api-sdk/settings-api";
import { filenameFromContentDisposition } from "@/app/_libs/utils/browser-download";

const DEFAULT_EXPORT_FILENAME = "InnoPeak-Export.json";

export interface TenantExportFile {
  blob: Blob;
  filename: string;
}

/** The body is the JSON file itself (no envelope), fetched as a `Blob`; the filename comes from `Content-Disposition`. */
export class TenantExportService {
  static async download(): Promise<TenantExportFile> {
    const response = await settingsApi.tenantExportControllerExportDataV1({ responseType: "blob" });
    return {
      // The SDK types a download as its declared (void) body; at runtime `responseType: "blob"` makes
      // it a `Blob`, hence the cast — same as `BillingService.downloadReceiptPdf`.
      blob: response.data as unknown as Blob,
      filename: filenameFromContentDisposition(
        response.headers["content-disposition"],
        DEFAULT_EXPORT_FILENAME,
      ),
    };
  }
}
