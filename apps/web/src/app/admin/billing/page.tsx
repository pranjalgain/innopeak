import type { Metadata } from "next";

import { AdminBillingView } from "@/app/admin/billing/_components/admin-billing-view";

export const metadata: Metadata = {
  title: "Billing — InnoPeak Admin",
};

export default function AdminBillingPage() {
  return <AdminBillingView />;
}
