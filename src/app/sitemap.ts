import type { MetadataRoute } from "next";
import { BOAT_CATALOG } from "@/lib/boats/catalog";
import { SITE_URL } from "@/lib/site";

export const dynamic = "force-static";

export default function sitemap(): MetadataRoute.Sitemap {
  return ["/", "/about", "/boats", ...BOAT_CATALOG.map((boat) => `/boats/${boat.profileSlug}`)]
    .map((path) => ({ url: new URL(path, SITE_URL).href }));
}
