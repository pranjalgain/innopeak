import "./globals.css";


import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import Script from "next/script";
import { NextIntlClientProvider } from "next-intl";
import { getMessages } from "next-intl/server";

import GoogleAnalyticsScripts from "@/app/_components/google-analytics";
import SonnarToaster from "@/app/_components/sonner-toaster";
import { ThemeProvider } from "@/app/_components/theme-provider";
import { firacode, geologica } from "@/app/_config/fonts";
import { getJsonLd } from "@/app/_config/jsonId";
import { metadata } from "@/app/_config/metadata";
import { viewport } from "@/app/_config/viewport";

export { metadata, viewport };

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const messages = await getMessages();

  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${geologica.variable} ${firacode.variable} font-sans antialiased`}>
        <NextIntlClientProvider messages={messages}>
          <ThemeProvider attribute="class" forcedTheme="light" disableTransitionOnChange>
            {children}
            <SonnarToaster />
            <GoogleAnalyticsScripts />
            <SpeedInsights />
            <Analytics />
            <Script
              id="json-ld"
              type="application/ld+json"
              dangerouslySetInnerHTML={{ __html: JSON.stringify(getJsonLd()) }}
            />
          </ThemeProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
