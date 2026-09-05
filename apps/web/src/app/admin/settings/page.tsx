import type { Metadata } from "next";

import { AdminSettingsView } from "@/app/admin/settings/_components/admin-settings-view";

export const metadata: Metadata = {
  title: "Platform settings — InnoPeak Admin",
};

export default function AdminSettingsPage() {
  return <AdminSettingsView />;
}
