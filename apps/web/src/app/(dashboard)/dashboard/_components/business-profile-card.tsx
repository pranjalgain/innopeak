import { useFormatter, useTranslations } from "next-intl";
import { LuClock, LuMapPin, LuStore } from "react-icons/lu";

import { Card, CardContent } from "@/components/ui/card";
import type { Tenant } from "@/types/domain";

interface BusinessProfileCardProps {
  tenant: Tenant;
}

/** Read-only summary from the backend; Google's category, phone and rating are never fetched. Connection management lives in Settings → Connection. */
export function BusinessProfileCard({ tenant }: BusinessProfileCardProps) {
  const t = useTranslations("dashboard.businessProfile");
  const format = useFormatter();
  const { location } = tenant;

  if (!location) {
    return (
      <Card>
        <CardContent className="text-sm text-muted-foreground">{t("noLocation")}</CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <LuStore className="size-4 shrink-0" />
          {location.name}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <LuMapPin className="size-4 shrink-0" />
          {location.address ?? t("noAddress")}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <LuClock className="size-4 shrink-0" />
          {location.lastSyncedAt
            ? t("lastSynced", {
                date: format.dateTime(new Date(location.lastSyncedAt), {
                  dateStyle: "medium",
                  timeStyle: "short",
                }),
              })
            : t("neverSynced")}
        </span>
      </CardContent>
    </Card>
  );
}
