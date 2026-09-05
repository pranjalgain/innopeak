import type { Metadata } from "next";

import { AdminUsersView } from "@/app/admin/users/_components/admin-users-view";

export const metadata: Metadata = {
  title: "Users — InnoPeak Admin",
};

export default function AdminUsersPage() {
  return <AdminUsersView />;
}
