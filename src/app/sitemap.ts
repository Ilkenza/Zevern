import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/env";

/**
 * One entry, and that is the honest size of it.
 *
 * Zevern has forty routes and thirty-nine of them are a private workspace — a sitemap
 * listing them would be listing addresses that answer with a redirect to /login. What
 * is public is the landing page, which is what "/" serves to a visitor.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: siteUrl(),
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 1,
    },
  ];
}
