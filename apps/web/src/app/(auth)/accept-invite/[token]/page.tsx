import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { AcceptInviteView } from "@/app/(auth)/accept-invite/[token]/_components/accept-invite-view";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("pageTitles");
  return { title: t("acceptInvite") };
}

interface AcceptInvitePageProps {
  params: Promise<{ token: string }>;
}

export default async function AcceptInvitePage({ params }: AcceptInvitePageProps) {
  const { token } = await params;
  return <AcceptInviteView token={token} />;
}
