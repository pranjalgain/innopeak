import type { ReactNode } from "react";

import { SiteFooter } from "@/app/(public)/_components/site-footer";
import { SiteHeader } from "@/app/(public)/_components/site-header";

interface PublicLayoutProps {
  children: ReactNode;
}

/**
 * Provides consistent navigation and footer chrome for public-facing pages.
 */
export default function PublicLayout({ children }: PublicLayoutProps) {
  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />
      <div className="flex-1">{children}</div>
      <SiteFooter />
    </div>
  );
}
