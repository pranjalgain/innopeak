import type { MetadataRoute } from "next";

import { env } from "env";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = env.NEXT_PUBLIC_APP_URL;
  const publicRoutes = [
    { path: "/", priority: 1 },
    { path: "/login", priority: 0.5 },
    { path: "/onboarding/signup", priority: 0.6 },
  ] as const;

  return publicRoutes.map((route) => ({
    url: new URL(route.path, baseUrl).toString(),
    lastModified: new Date(),
    changeFrequency: "weekly",
    priority: route.priority,
  }));
}
