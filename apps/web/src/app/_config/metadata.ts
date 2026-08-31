import type { Metadata } from "next";

import { env } from "env";

/**
 * @description Metadata for the website
 * @returns {Metadata} Metadata for the website
 */
export const metadata: Metadata = {
  title: {
    template: `%s - ${env.NEXT_PUBLIC_APP_TITLE}`,
    default: env.NEXT_PUBLIC_APP_TITLE,
  },
  description: env.NEXT_PUBLIC_APP_DESCRIPTION,
  keywords: env.NEXT_PUBLIC_APP_KEYWORDS,
  alternates: {
    canonical: env.NEXT_PUBLIC_APP_URL,
  },
  twitter: {
    card: "summary_large_image",
    title: env.NEXT_PUBLIC_APP_TITLE,
    description: env.NEXT_PUBLIC_APP_DESCRIPTION,
  },
  openGraph: {
    siteName: env.NEXT_PUBLIC_APP_TITLE,
    url: env.NEXT_PUBLIC_APP_URL,
    type: "website",
  },
  icons: {
    icon: [
      {
        url: "/brand-mark.svg",
        type: "image/svg+xml",
      },
    ],
    shortcut: ["/brand-mark.svg"],
  },
};
