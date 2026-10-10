import { useFormatter, useTranslations } from "next-intl";
import { LuClock, LuGlobe, LuMapPin, LuPhone, LuStore } from "react-icons/lu";

import { Card, CardContent } from "@/components/ui/card";
import type { Tenant } from "@/types/domain";

interface BusinessProfileCardProps {
  tenant: Tenant;
}

/** The website as a safe link target: only http(s) is ever linked; anything else (javascript:, data:) is not a link. */
function safeWebsiteHref(uri: string): string | null {
  try {
    const url = new URL(uri);
    return url.protocol === "https:" || url.protocol === "http:" ? url.href : null;
  } catch {
    return null;
  }
}

/** Shown without the scheme and trailing slash: "coastaltable.example" reads better than the full URL. */
function displayWebsite(uri: string): string {
  return uri.replace(/^https?:\/\//i, "").replace(/\/$/, "");
}

/** Read-only summary from the backend. Phone and website appear only when the business lists them on Google; its
 *  category and rating are never fetched. Connection management lives in Settings → Connection. */
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
        {location.phone ? (
          <a
            href={`tel:${location.phone.replace(/[^\d+]/g, "")}`}
            aria-label={t("phoneLabel", { phone: location.phone })}
            className="inline-flex items-center gap-1.5 hover:text-foreground"
          >
            <LuPhone className="size-4 shrink-0" />
            {location.phone}
          </a>
        ) : null}
        {location.websiteUri && safeWebsiteHref(location.websiteUri) ? (
          <a
            href={safeWebsiteHref(location.websiteUri) ?? undefined}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={t("websiteLabel", { website: displayWebsite(location.websiteUri) })}
            className="inline-flex min-w-0 items-center gap-1.5 hover:text-foreground"
          >
            <LuGlobe className="size-4 shrink-0" />
            <span className="truncate">{displayWebsite(location.websiteUri)}</span>
          </a>
        ) : null}
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
