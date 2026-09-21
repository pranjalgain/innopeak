import type { Metadata } from "next";

import { AdminBusinessesView } from "@/app/admin/businesses/_components/admin-businesses-view";

export const metadata: Metadata = {
  // `absolute` bypasses the root layout's title template (`%s - InnoPeak`) — see admin/page.tsx.
  title: { absolute: "Businesses — InnoPeak Admin" },
};

export default function AdminBusinessesPage() {
  return <AdminBusinessesView />;
}
