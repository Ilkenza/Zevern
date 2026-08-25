import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/env";

/**
 * Everything except the front door is behind a session, so a crawler would be
 * redirected to /login from all of it anyway. Saying so explicitly is still worth the
 * four lines: it keeps the app's own URLs — which contain row ids — out of the crawl
 * queue and out of the "pages blocked by redirect" report, and it names the calendar
 * feed, which is the one address that would answer a crawler if it ever leaked.
 */
export default function robots(): MetadataRoute.Robots {
  const base = siteUrl();
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/api/",
          "/auth/",
          "/print/",
          "/login",
          "/forgot-password",
          "/reset-password",
          "/clients",
          "/projects",
          "/tasks",
          "/invoices",
          "/quotes",
          "/leads",
          "/seo",
          "/toolbox",
          "/settings",
          "/private",
        ],
      },
    ],
    sitemap: `${base}/sitemap.xml`,
    host: base,
  };
}
