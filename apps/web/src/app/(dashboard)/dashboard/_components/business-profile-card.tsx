import { useTranslations } from "next-intl";
import { LuMapPin, LuPhone, LuStar, LuStore } from "react-icons/lu";

import { Card, CardContent } from "@/components/ui/card";
import type { Tenant } from "@/types/domain";

interface BusinessProfileCardProps {
  tenant: Tenant;
}

/**
 * Read-only summary of what's synced from the connected Google Business
 * Profile (category, address, phone, Google's own rating). Full connection
 * management (disconnect, etc.) lives in Settings → Connection — this is
 * just the at-a-glance view.
 */
export function BusinessProfileCard({ tenant }: BusinessProfileCardProps) {
  const t = useTranslations("dashboard.businessProfile");

  return (
    <Card>
      <CardContent className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <LuStore className="size-4 shrink-0" />
            {tenant.businessType}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <LuMapPin className="size-4 shrink-0" />
            {tenant.address}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <LuPhone className="size-4 shrink-0" />
            {tenant.phone}
          </span>
        </div>

        <div className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-warning-soft px-3 py-1.5 text-sm font-medium text-warning">
          <LuStar className="size-4 fill-current" />
          {tenant.googleRating.toFixed(1)}
          <span className="text-warning/70">
            {t("googleReviewCount", { count: tenant.googleReviewCount })}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
