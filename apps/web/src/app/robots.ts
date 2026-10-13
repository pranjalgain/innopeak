import type { MetadataRoute } from "next";

import { env } from "env";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      // The signed-in app and the admin console have nothing for a crawler; `/v1/` is the API behind the rewrite.
      disallow: ["/api/", "/v1/", "/dashboard", "/review-queue", "/settings", "/admin"],
    },
    sitemap: `${env.NEXT_PUBLIC_APP_URL}/sitemap.xml`,
    host: env.NEXT_PUBLIC_APP_URL,
  };
}
