import "./globals.css";


import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import Script from "next/script";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";

import GoogleAnalyticsScripts from "@/app/_components/google-analytics";
import SonnarToaster from "@/app/_components/sonner-toaster";
import { TanstackProvider } from "@/app/_components/tanstack-provider";
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
  const [locale, messages] = await Promise.all([getLocale(), getMessages()]);

  return (
    <html lang={locale} suppressHydrationWarning>
      <body className={`${geologica.variable} ${firacode.variable} font-sans antialiased`}>
        <NextIntlClientProvider messages={messages}>
          {/* `disableTransitionOnChange` left at its default (`false`), deliberately and with
              eyes open: the base-layer `*` rule in `globals.css` means *every* element does
              cross-fade its colors on a theme change, which is exactly the situation next-themes'
              transition-suppression was built to kill. Here that simultaneous fade is the
              intended effect rather than the artifact — a whole-page palette dissolve, not a
              flash — so enabling suppression would turn the feature off. The cost is real and
              accepted: colour-heavy pages (the auth screens' decorative SVG field, long admin
              tables) animate a lot of nodes at once on toggle. If that ever reads as jank on a
              low-end device, the fix is to narrow the `*` rule's property list, not to switch
              suppression on — that would take the deliberate fade with it. */}
          <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false}>
            <TanstackProvider>
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
            </TanstackProvider>
          </ThemeProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
