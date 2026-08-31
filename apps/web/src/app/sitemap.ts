import type { MetadataRoute } from "next";

import { env } from "env";

/**
 * @description Sitemap for the website
 * @returns {MetadataRoute.Sitemap} Sitemap for the website
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = env.NEXT_PUBLIC_APP_URL;
  const publicRoutes = [
    { path: "/", priority: 1 },
    { path: "/showcase", priority: 0.9 },
    { path: "/reference", priority: 0.7 },
    { path: "/users", priority: 0.5 },
  ] as const;

  return publicRoutes.map((route) => ({
    url: new URL(route.path, baseUrl).toString(),
    lastModified: new Date(),
    changeFrequency: "weekly",
    priority: route.priority,
  }));
}
