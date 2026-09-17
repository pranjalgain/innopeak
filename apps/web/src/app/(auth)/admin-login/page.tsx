import type { Metadata } from "next";

import { AdminLoginView } from "@/app/(auth)/admin-login/_components/admin-login-view";
import { RedirectIfAuthenticated } from "@/app/_components/redirect-if-authenticated";

export const metadata: Metadata = {
  title: "Admin sign in",
};

export default function AdminLoginPage() {
  return (
    <RedirectIfAuthenticated>
      <AdminLoginView />
    </RedirectIfAuthenticated>
  );
}
