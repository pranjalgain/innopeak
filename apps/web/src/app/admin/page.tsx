import type { Metadata } from "next";

import { AdminOverviewView } from "@/app/admin/_components/admin-overview-view";

export const metadata: Metadata = {
  // `absolute` bypasses the root layout's title template (`%s - InnoPeak`) entirely — admin
  // screens brand themselves "InnoPeak Admin", a different suffix than the rest of the app.
  title: { absolute: "Overview — InnoPeak Admin" },
};

export default function AdminOverviewPage() {
  return <AdminOverviewView />;
}
