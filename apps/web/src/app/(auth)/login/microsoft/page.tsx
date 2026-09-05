import type { Metadata } from "next";

import { MockMicrosoftSsoView } from "@/app/(auth)/login/microsoft/_components/mock-microsoft-sso-view";

export const metadata: Metadata = {
  title: "Sign in with Microsoft — InnoPeak",
};

export default function LoginMicrosoftPage() {
  return <MockMicrosoftSsoView />;
}
