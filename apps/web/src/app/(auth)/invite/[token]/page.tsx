import type { Metadata } from "next";

import { AcceptInviteView } from "@/app/(auth)/invite/[token]/_components/accept-invite-view";

export const metadata: Metadata = {
  title: "Accept Invite",
};

interface AcceptInvitePageProps {
  params: Promise<{ token: string }>;
}

export default async function AcceptInvitePage({ params }: AcceptInvitePageProps) {
  const { token } = await params;
  return <AcceptInviteView token={token} />;
}
