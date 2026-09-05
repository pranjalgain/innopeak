import type { Metadata } from "next";

import { LoginView } from "@/app/(auth)/login/_components/login-view";

export const metadata: Metadata = {
  title: "Sign in — InnoPeak",
};

export default function LoginPage() {
  return <LoginView />;
}
