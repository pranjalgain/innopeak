import { useLocale, useTranslations } from "next-intl";

import { cn } from "@/app/_libs/utils/cn";
import { formatRelativeTime } from "@/app/_libs/utils/relative-time";
import { TYPE_ICON, TYPE_ICON_CLASSNAME } from "@/app/admin/_components/activity-log-card";
import { LoadErrorState } from "@/components/common/load-error-state";
import { Pagination } from "@/components/common/pagination";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  PLATFORM_ACTIVITY_FILTER_TYPES,
  type PlatformActivityFilter,
  useAdminPlatformActivityLog,
} from "@/hooks/admin/use-admin-platform-activity-log";

/**
 * Paginated platform-admin action history; unlike the Overview's `ActivityLogCard` it has no
 * synthesized "business joined" entries, and it reuses that card's icon/color language and message
 * templates.
 */
export function PlatformActivityLogCard() {
  const t = useTranslations("adminActivity");
  const tMessages = useTranslations("adminOverview.activityLog.messages");
  const locale = useLocale();
  const {
    activities,
    filter,
    setFilter,
    isLoading,
    isError,
    retry,
    total,
    page,
    totalPages,
    goToPreviousPage,
    goToNextPage,
  } = useAdminPlatformActivityLog();

  const isFiltered = filter !== "all";

  return (
    <Card className="h-full">
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
        <div>
          <CardTitle>{t("platformActivityLog.title")}</CardTitle>
          <CardDescription>{t("platformActivityLog.subtitle")}</CardDescription>
        </div>
        <Select
          value={filter}
          onValueChange={(value) => setFilter(value as PlatformActivityFilter)}
        >
          <SelectTrigger size="sm" aria-label={t("filters.label")} className="w-fit">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("filters.all")}</SelectItem>
            {PLATFORM_ACTIVITY_FILTER_TYPES.map((type) => (
              <SelectItem key={type} value={type}>
                {t(`filters.types.${type}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-3">
        {/* Fixed height, as in `BillingWebhookEventsCard`. */}
        <div className="flex flex-1 flex-col gap-1 sm:min-h-[600px]">
          {isError ? (
            <LoadErrorState onRetry={retry} />
          ) : activities.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {isFiltered ? t("filters.noResults") : t("platformActivityLog.empty")}
            </p>
          ) : (
            activities.map((entry) => {
              const Icon = TYPE_ICON[entry.type];
              return (
                <div key={entry.id} className="flex items-start gap-3 py-1.5">
                  <span
                    className={cn(
                      "mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full",
                      TYPE_ICON_CLASSNAME[entry.type],
                    )}
                  >
                    <Icon className="size-3.5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm">
                      {tMessages(entry.type, {
                        businessName: entry.businessName ?? "",
                        email: entry.email ?? "",
                      })}
                    </p>
                    <p className="truncate text-[13px] text-muted-foreground">
                      {formatRelativeTime(entry.occurredAt, locale)}
                    </p>
                  </div>
                </div>
              );
            })
          )}
        </div>
        {!isLoading && total > 0 ? (
          <Pagination
            page={page}
            totalPages={totalPages}
            onPrevious={goToPreviousPage}
            onNext={goToNextPage}
          />
        ) : null}
      </CardContent>
    </Card>
  );
}
