import type { Metadata } from "next";

import { AdminBillingView } from "@/app/admin/billing/_components/admin-billing-view";

export const metadata: Metadata = {
  // `absolute` bypasses the root layout's title template — see admin/page.tsx.
  title: { absolute: "Billing — InnoPeak Admin" },
};

export default function AdminBillingPage() {
  return <AdminBillingView />;
}
