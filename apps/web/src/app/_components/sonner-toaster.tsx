"use client";

import { useTranslations } from "next-intl";

import { Toaster } from "@/components/ui/sonner";

export default function SonnarToaster() {
  const t = useTranslations("common.toast");

  // 2 s was too short to read an error, let alone act on it; the close button lets people dismiss it sooner. Its label and the region's
  // are sonner's English defaults ("Close toast", "Notifications alt+T") unless given here.
  return (
    <Toaster
      richColors
      closeButton
      position="top-right"
      duration={6000}
      containerAriaLabel={t("region")}
      toastOptions={{ closeButtonAriaLabel: t("close") }}
    />
  );
}
