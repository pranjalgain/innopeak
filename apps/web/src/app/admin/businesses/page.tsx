import type { Metadata } from "next";

import { AdminBusinessesView } from "@/app/admin/businesses/_components/admin-businesses-view";

export const metadata: Metadata = {
  title: "Businesses — InnoPeak Admin",
};

export default function AdminBusinessesPage() {
  return <AdminBusinessesView />;
}
