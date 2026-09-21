import type { Metadata } from "next";

import { MockMicrosoftSsoView } from "@/app/(auth)/login/microsoft/_components/mock-microsoft-sso-view";
import { RedirectIfAuthenticated } from "@/app/_components/redirect-if-authenticated";

export const metadata: Metadata = {
  title: "Sign in with Microsoft",
};

export default function LoginMicrosoftPage() {
  return (
    <RedirectIfAuthenticated>
      <MockMicrosoftSsoView />
    </RedirectIfAuthenticated>
  );
}
