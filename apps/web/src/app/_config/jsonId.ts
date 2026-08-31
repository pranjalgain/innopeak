import { env } from "env";

/**
 * @description Improves SEO (Search Engine Optimization) and provide rich results in search engines like Google by supplying schema.org metadata. It defines metadata for your web application in a machine-readable format, allowing search engines to:
 * - Understand the purpose and functionality of your web application
 * - Display structured data in search results
 * - Provide rich snippets in search engine results
 * - Enhance the visibility and discoverability of your web application
 * - Improve the user experience by providing additional context and information
 * - Increase the chances of appearing in featured snippets
 * - Enhance the click-through rate (CTR) of your web application
 * - Improve the overall ranking and visibility of your web application
 * @returns {Object} JSON-LD data
 */
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
