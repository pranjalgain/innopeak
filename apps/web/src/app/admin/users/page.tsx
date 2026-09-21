import type { Metadata } from "next";

import { AdminUsersView } from "@/app/admin/users/_components/admin-users-view";

export const metadata: Metadata = {
  // `absolute` bypasses the root layout's title template (`%s - InnoPeak`) — see admin/page.tsx.
  title: { absolute: "Users — InnoPeak Admin" },
};

export default function AdminUsersPage() {
  return <AdminUsersView />;
}
