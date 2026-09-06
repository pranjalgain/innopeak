import type { Route } from "next";
import Link from "next/link";
import { useTranslations } from "next-intl";

import { ROUTES } from "@/app/_libs/constants/routes";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { AdminBusiness } from "@/types/domain";

const DATE_FORMATTER = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" });
const RECENT_COUNT = 3;

interface RecentBusinessesCardProps {
  businesses: AdminBusiness[];
}

export function RecentBusinessesCard({ businesses }: RecentBusinessesCardProps) {
  const t = useTranslations("adminOverview.recentBusinesses");
  const recent = [...businesses]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, RECENT_COUNT);

  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{t("subtitle")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-1">
        {recent.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("empty")}</p>
        ) : (
          recent.map((business) => (
            <div key={business.id} className="flex items-center justify-between gap-3 py-1.5">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{business.name}</p>
                <p className="truncate text-[13px] text-muted-foreground">{business.ownerName}</p>
              </div>
              <span className="shrink-0 text-[13px] text-muted-foreground">
                {DATE_FORMATTER.format(new Date(business.createdAt))}
              </span>
            </div>
          ))
        )}

        <Link
          href={ROUTES.ADMIN_BUSINESSES as Route}
          className="mt-auto pt-3 text-sm font-medium text-primary no-underline transition-colors hover:text-primary/80"
        >
          {t("viewAll")}
        </Link>
      </CardContent>
    </Card>
  );
}
