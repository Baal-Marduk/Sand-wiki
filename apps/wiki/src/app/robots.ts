import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      // Action/auth/admin surfaces carry no indexable content and shouldn't be crawled.
      disallow: ["/admin", "/contribute", "/api"],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
