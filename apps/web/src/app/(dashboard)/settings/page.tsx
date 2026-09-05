import type { Metadata } from "next";

import { SettingsView } from "@/app/(dashboard)/settings/_components/settings-view";

export const metadata: Metadata = {
  title: "Settings — InnoPeak",
};

export default function SettingsPage() {
  return <SettingsView />;
}
