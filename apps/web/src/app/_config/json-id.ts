import { env } from "env";

export const getJsonLd = () => ({
  "@context": "https://schema.org",
  "@type": "WebApplication",
  name: env.NEXT_PUBLIC_APP_NAME,
  url: env.NEXT_PUBLIC_APP_URL,
  description: env.NEXT_PUBLIC_APP_DESCRIPTION,
  image: new URL("/brand-mark.svg", env.NEXT_PUBLIC_APP_URL).toString(),
  applicationCategory: env.NEXT_PUBLIC_APP_CATEGORY,
  offers: {
    "@type": "Offer",
    description: env.NEXT_PUBLIC_APP_DESCRIPTION,
  },
  keywords: env.NEXT_PUBLIC_APP_KEYWORDS,
});
