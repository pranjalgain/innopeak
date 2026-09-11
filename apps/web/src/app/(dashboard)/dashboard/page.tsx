import type { Metadata } from "next";

import { DashboardView } from "@/app/(dashboard)/dashboard/_components/dashboard-view";

export const metadata: Metadata = {
  title: "Dashboard",
};

export default function DashboardPage() {
  return <DashboardView />;
}
