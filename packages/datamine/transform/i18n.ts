import type { LocalizedText } from "@sandlabs/data";
import type { Localization } from "./sek";

/** Build a slug -> {locale -> LocalizedText} map for ITEMS, carrying every NON-EN locale
 *  (EN stays the entity's primary name/description). Slugs come from reconcile (sekId->slug).
 *  Entities with only EN get no entry. */
export function buildItemI18n(
  loc: Localization,
  slugBySekId: Map<string, string>,
): Map<string, Record<string, LocalizedText>> {
  const out = new Map<string, Record<string, LocalizedText>>();
  for (const [sekId, entry] of Object.entries(loc.items)) {
    const slug = slugBySekId.get(sekId);
    if (!slug) continue;
    const i18n: Record<string, LocalizedText> = {};
    for (const [locale, t] of Object.entries(entry.locales)) {
      if (locale === "en") continue;
      i18n[locale] = { name: t.name, description: t.desc ?? null };
    }
    if (Object.keys(i18n).length > 0) out.set(slug, i18n);
  }
  return out;
}
