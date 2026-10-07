import { describe, expect, it, vi } from "vitest";

import { settingsApi } from "@/app/_libs/api-sdk/settings-api";
import { TenantExportService } from "@/app/_libs/services/tenant-export.service";

describe("TenantExportService.download", () => {
  it("asks for a blob and uses the server's filename", async () => {
    const blob = new Blob(["{}"], { type: "application/json" });
    const call = vi.spyOn(settingsApi, "tenantExportControllerExportDataV1").mockResolvedValue({
      data: blob,
      headers: { "content-disposition": 'attachment; filename="innopeak-export-acme-2026-10-07.json"' },
    } as never);

    const result = await TenantExportService.download();

    expect(call).toHaveBeenCalledWith({ responseType: "blob" });
    expect(result.blob).toBe(blob);
    expect(result.filename).toBe("innopeak-export-acme-2026-10-07.json");
  });

  it("falls back to a default filename when the header is missing", async () => {
    vi.spyOn(settingsApi, "tenantExportControllerExportDataV1").mockResolvedValue({
      data: new Blob(["{}"]),
      headers: {},
    } as never);

    expect((await TenantExportService.download()).filename).toBe("InnoPeak-Export.json");
  });
});
