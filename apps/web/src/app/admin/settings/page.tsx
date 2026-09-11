import type { Metadata } from "next";

import { AdminSettingsView } from "@/app/admin/settings/_components/admin-settings-view";

export const metadata: Metadata = {
  // `absolute` bypasses the root layout's title template (`%s - InnoPeak`) — see admin/page.tsx.
  title: { absolute: "Platform settings — InnoPeak Admin" },
};

export default function AdminSettingsPage() {
  return <AdminSettingsView />;
}
