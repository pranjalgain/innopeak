import { useTranslations } from "next-intl";
import { LuDownload } from "react-icons/lu";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useDownloadTenantExport } from "@/hooks/settings/use-download-tenant-export";

/** Settings → General: take a copy of the business's data. Owner-only (the whole General tab is);
 *  also offered inside the Delete business dialog, where it matters most. */
export function ExportDataSection() {
  const t = useTranslations("settings.exportData");
  const download = useDownloadTenantExport();

  return (
    <Card className="animate-in fade-in slide-in-from-bottom-2 fill-mode-backwards ease-fluid motion-reduce:animate-none duration-500">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <LuDownload className="text-primary size-4" />
          {t("title")}
        </CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent>
        <Button
          type="button"
          variant="outline"
          disabled={download.isPending}
          onClick={() => download.mutate()}>
          {download.isPending ? t("downloading") : t("download")}
        </Button>
      </CardContent>
    </Card>
  );
}
