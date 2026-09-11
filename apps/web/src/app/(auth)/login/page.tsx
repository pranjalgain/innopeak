import type { Metadata } from "next";

import { LoginView } from "@/app/(auth)/login/_components/login-view";
import { RedirectIfAuthenticated } from "@/app/_components/redirect-if-authenticated";

export const metadata: Metadata = {
  title: "Sign in",
};

export default function LoginPage() {
  return (
    <RedirectIfAuthenticated>
      <LoginView />
    </RedirectIfAuthenticated>
  );
}
