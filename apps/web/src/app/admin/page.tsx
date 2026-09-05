import type { Metadata } from "next";

import { AdminOverviewView } from "@/app/admin/_components/admin-overview-view";

export const metadata: Metadata = {
  title: "Admin overview — InnoPeak",
};

export default function AdminOverviewPage() {
  return <AdminOverviewView />;
}
