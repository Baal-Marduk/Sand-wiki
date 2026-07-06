import type { MetadataRoute } from "next";
import { listEntityPaths } from "@/lib/queries";
import { entityHref } from "@/lib/entity-links";
import { SITE_URL } from "@/lib/site";

/** Static, indexable top-level routes (admin/contribute/api are excluded — see robots.ts). */
const STATIC_PATHS: { path: string; priority: number }[] = [
  { path: "/", priority: 1 },
  { path: "/items", priority: 0.8 },
  { path: "/environment", priority: 0.8 },
  { path: "/tramplers", priority: 0.8 },
  { path: "/tech", priority: 0.8 },
  { path: "/data", priority: 0.6 },
  { path: "/achievements", priority: 0.6 },
  { path: "/about", priority: 0.4 },
];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const entities = await listEntityPaths();

  const staticEntries: MetadataRoute.Sitemap = STATIC_PATHS.map(({ path, priority }) => ({
    url: `${SITE_URL}${path}`,
    changeFrequency: "weekly",
    priority,
  }));

  const entityEntries: MetadataRoute.Sitemap = entities
    .map(({ slug, kind }) => entityHref(kind, slug))
    .filter((href): href is string => href !== null)
    .map((href) => ({
      url: `${SITE_URL}${href}`,
      changeFrequency: "monthly",
      priority: 0.6,
    }));

  return [...staticEntries, ...entityEntries];
}
