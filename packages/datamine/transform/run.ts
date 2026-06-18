// Orchestrates the transform: load baseline + sek-out, reconcile items, build i18n, merge
// items, deep-derive container loot links, diff, validate, write artifact + missing report.
// Recipes + non-loot links + parts/tech/locations entities pass through from the baseline
// this iteration (merge framework is extensible per-kind).
//   npx tsx transform/run.ts [--allow-slug-changes]
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { loadBaseline } from "./baseline";
import { loadSekItems, loadLocalization, loadContainerLoot } from "./sek";
import { reconcile } from "./reconcile";
import { buildItemI18n } from "./i18n";
import { mergeItems } from "./merge";
import { applyIconOverrides } from "./items";
import { loadCompartmentStats, mergeTrampler } from "./trampler";
import { enumerateItems } from "./enumerate";
import { canonicalSekId } from "./variants";
import { buildLootLinks, applyLoot, type LootOverrides } from "./loot";
import { classifyImages } from "./images";
import { diffEntities } from "./diff";
import { validateEntities, writeArtifact, writeMissingReport, writeImagesReport } from "./emit";

const PUBLIC = resolve(import.meta.dirname, "../../../apps/wiki/public");

const allowSlugChanges = process.argv.includes("--allow-slug-changes");
const readJson = (p: string) => JSON.parse(readFileSync(resolve(import.meta.dirname, p), "utf-8"));
const overrides = readJson("overrides/slug-map.json") as Record<string, string>;
const lootOverrides = readJson("overrides/loot-overrides.json") as LootOverrides;
const exclusions = new Set(readJson("overrides/exclusions.json") as string[]);
const iconMap = readJson("overrides/icon-map.json") as Record<string, string>;
const partOverrides = readJson("overrides/part-slug-map.json") as Record<string, string>;
// Slugs intentionally kept hardcoded (baseline-only) — non-droppable/non-craftable items the
// game registry doesn't expose for datamining (binoculars, flashlight, map, multitool). They are
// NOT gaps to fix, so they're filtered out of the missing-from-datamine report.
const hardcodedItems = new Set(readJson("overrides/hardcoded-items.json") as string[]);

const baseline = loadBaseline();
// Drop excluded SEK ids (junk/duplicate pseudo-items that shouldn't become wiki pages,
// e.g. game_treasureShovel) before any reconcile/merge so they never get added.
const sekItems = loadSekItems().filter((i) => !exclusions.has(i.id));
const loc = loadLocalization();
const containerLoot = loadContainerLoot();

// --- items: enumerate (SEK items ∪ localization registry) -> reconcile -> i18n -> merge ---
const allItems = enumerateItems(loc, sekItems).filter((i) => !exclusions.has(i.id));
const rec = reconcile(allItems.map((i) => ({ id: i.id, name: i.name })), baseline.entities, overrides);
// Localization ENRICHES/MATCHES baseline entities but must never MINT new pages — the loc
// table is noisy (internal "Note" items, debug/test boxes, name-drift dupes). Only items that
// come from the curated SEK items.json may create a new entity; loc-only ids that don't match
// a baseline entity (status "new") are dropped here. Matched/override loc ids still enrich + i18n.
const realSekIds = new Set(sekItems.map((i) => canonicalSekId(i.id)));
const mergeable = allItems.filter((it) => {
  const hit = rec.bySekId.get(it.id);
  return hit !== undefined && (hit.status !== "new" || realSekIds.has(it.id));
});
const i18n = buildItemI18n(loc, new Map([...rec.bySekId].map(([id, hit]) => [id, hit.slug])));
const merged = mergeItems(baseline.entities, mergeable, rec.bySekId, i18n);
// Force corrected icons last (fixes stale/wrong paths in the source data).
const entities = applyIconOverrides(merged.entities, iconMap);
// Genuine gaps only — drop the intentionally-hardcoded baseline-only items.
const missing = merged.missing.filter((m) => !hardcodedItems.has(m.slug));
const hardcodedKept = merged.missing.length - missing.length;

// --- trampler stats: refresh part stats from compartment_stats.json when present ---
const compartmentStats = loadCompartmentStats();
const withTrampler = compartmentStats.length
  ? mergeTrampler(entities, compartmentStats, partOverrides)
  : entities;
if (compartmentStats.length) {
  console.log(`trampler stats: refreshed from ${compartmentStats.length} compartments`);
} else {
  console.log("trampler stats: source absent (compartment_stats.json) — baseline preserved");
}

// --- loot: deep-derive container loot links, then drop any pointing at an unknown slug ---
const knownSlugs = new Set(withTrampler.map((e) => e.slug));
const loot = buildLootLinks(containerLoot, lootOverrides);
const dangling = loot.links.filter((l) => l.targetSlug && !knownSlugs.has(l.targetSlug));
if (dangling.length) {
  console.warn(`loot: dropping ${dangling.length} link(s) to unknown item slugs:`,
    [...new Set(dangling.map((l) => l.targetSlug))].slice(0, 20).join(", "));
}
loot.links = loot.links.filter((l) => !l.targetSlug || knownSlugs.has(l.targetSlug));
const links = applyLoot(baseline.links, loot);

// --- diff + guards ---
const diff = diffEntities(baseline.entities, withTrampler);
console.log(`entities ${diff.total.prev} -> ${diff.total.next} | +${diff.added.length} added, -${diff.removed.length} removed`);
console.log(`reconcile: ${[...rec.bySekId.values()].filter((h) => h.status === "matched").length} matched, ` +
  `${[...rec.bySekId.values()].filter((h) => h.status === "new").length} new, ` +
  `${[...rec.bySekId.values()].filter((h) => h.status === "override").length} override`);
console.log(`loot: refreshed ${loot.covered.size} containers, ${loot.links.length} loot links`);
console.log(`missing-from-datamine: ${missing.length} genuine gaps (+${hardcodedKept} intentionally hardcoded, excluded)`);
if (diff.added.length) console.log("  added:", diff.added.slice(0, 20).join(", ") + (diff.added.length > 20 ? " …" : ""));

if (diff.removed.length > 0 && !allowSlugChanges) {
  console.error(`REFUSING: ${diff.removed.length} existing slug(s) would be removed: ${diff.removed.join(", ")}`);
  console.error("re-run with --allow-slug-changes if this is intended.");
  process.exit(1);
}

validateEntities(withTrampler);

// --- images: report entities whose icon is null or whose file is missing on disk ---
const images = classifyImages(withTrampler, (icon) => existsSync(resolve(PUBLIC, `.${icon}`)));
console.log(`missing images: ${images.needsExtraction.length} need extraction ` +
  `(by design: ${images.byDesign.techNodeNoIcon} tech-nodes, ${images.byDesign.environmentNoIcon} locations)`);

// recipes + non-loot links + parts/tech/locations entities pass through from baseline.
writeArtifact(withTrampler, baseline.recipes, links);
writeMissingReport(missing);
writeImagesReport(images);
console.log("wrote packages/data/generated/{entities,recipes,links}.json + reports/{missing-from-datamine,missing-images}.json");
