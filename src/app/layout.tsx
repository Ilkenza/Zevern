import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Manrope, Spline_Sans_Mono } from "next/font/google";
import Script from "next/script";
import "./globals.css";
import { siteUrl } from "@/lib/env";

const bricolage = Bricolage_Grotesque({
  variable: "--font-bricolage",
  subsets: ["latin"],
  weight: ["500", "600", "700", "800"],
});

const manrope = Manrope({
  variable: "--font-manrope",
  subsets: ["latin"],
  // 300 exists for one thing: the masthead, where the month is set light and wide.
  weight: ["300", "400", "500", "600", "700", "800"],
});

const splineMono = Spline_Sans_Mono({
  variable: "--font-spline-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

const TITLE = "Zevern — one workspace for a freelance web designer";
const DESCRIPTION =
  "Everything between finding a client and getting paid, in one place. Leads, quotes, projects, invoices, clients, tasks, an SEO check and your toolbox — for one person working alone.";

/**
 * `metadataBase` is what turns the relative `opengraph-image` into the absolute URL a
 * link preview needs, so every card in every chat app depends on it resolving to the
 * real host. `title.template` gives the pages that set one a suffix without repeating
 * the brand, and the app pages themselves stay `noindex` — they are behind a session
 * and their paths carry row ids.
 */
export const metadata: Metadata = {
  metadataBase: new URL(siteUrl()),
  title: { default: TITLE, template: "%s · Zevern" },
  description: DESCRIPTION,
  applicationName: "Zevern",
  keywords: [
    "freelance",
    "web designer",
    "invoicing",
    "quotes",
    "leads",
    "client management",
    "solo business",
  ],
  openGraph: {
    type: "website",
    siteName: "Zevern",
    title: TITLE,
    description: DESCRIPTION,
    url: "/",
    locale: "en_GB",
  },
  twitter: { card: "summary_large_image", title: TITLE, description: DESCRIPTION },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, "max-image-preview": "large" },
  },
  alternates: { canonical: "/" },
};

/** The app is dark and only dark, so the browser chrome should be told rather than guess. */
export const viewport: Viewport = {
  themeColor: "#14161b",
  colorScheme: "dark",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${bricolage.variable} ${manrope.variable} ${splineMono.variable} h-full`}
    >
      <body suppressHydrationWarning className="min-h-full">
        {/*
          Dev only: paint the chosen button treatment before anything renders.

          The picker itself is a React component, which means it cannot set the attribute
          until after hydration — long enough for every button on the page to flash its
          default first, and for the whole thing to look broken if the shell has not been
          recompiled. A blocking inline script has no such problem: it runs before paint,
          reads the same key the picker writes, and puts `data-btn` on `<html>` where the
          stylesheet is already waiting for it.

          `suppressHydrationWarning` is already on `<html>` above, so the attribute this
          adds does not become a mismatch.

          Delete with `src/components/dev`.
        */}
        {process.env.NODE_ENV === "development" && (
          <Script id="zv-btn-theme" strategy="beforeInteractive">
            {"try{var t=localStorage.getItem('zv-btn-theme');if(t)document.documentElement.dataset.btn=t}catch(e){}"}
          </Script>
        )}
        {children}
      </body>
    </html>
  );
}
