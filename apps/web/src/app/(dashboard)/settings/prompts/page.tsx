import type { Metadata } from "next";

import { PromptManagementView } from "@/app/(dashboard)/settings/prompts/_components/prompt-management-view";

export const metadata: Metadata = {
  title: "AI Prompts",
};

export default function PromptManagementPage() {
  return <PromptManagementView />;
}
