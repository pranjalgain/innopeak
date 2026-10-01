import type { Metadata } from "next";

import { AdminActivityView } from "@/app/admin/activity/_components/admin-activity-view";

export const metadata: Metadata = {
  // `absolute` bypasses the root layout's title template — see admin/page.tsx.
  title: { absolute: "Activity — InnoPeak Admin" },
};

export default function AdminActivityPage() {
  return <AdminActivityView />;
}
