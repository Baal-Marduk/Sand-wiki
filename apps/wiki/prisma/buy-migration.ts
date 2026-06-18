import type { PrismaClient } from "@prisma/client";

export interface MigLine { slug: string; amount: number }
export interface MigRecipe { id: string; slug: string; inputs: MigLine[]; outputs: MigLine[] }

const has = (lines: MigLine[], slug: string) => lines.some((l) => l.slug === slug);

/** Classify a recipe relative to the currency item. "buy" = currency in & item out;
 *  "sell" = item in & currency out; "keep" = anything else (incl. currency on both
 *  sides, or no currency). */
export function classifyCoinRecipe(rec: MigRecipe, currencySlug: string): "buy" | "sell" | "keep" {
  const inHas = has(rec.inputs, currencySlug);
  const outHas = has(rec.outputs, currencySlug);
  if (inHas === outHas) return "keep"; // both or neither -> not a pure trade
  return inHas ? "buy" : "sell";
}

export interface ExtractedOption { costs: MigLine[]; yield: number }

/** From a buy recipe, the cost components (all inputs) and the yield (the item output's
 *  amount). `itemSlug` is the bought item (the recipe's non-currency output). */
export function buyOptionFromRecipe(rec: MigRecipe, itemSlug: string): ExtractedOption {
  const costs = rec.inputs.map((l) => ({ slug: l.slug, amount: l.amount }));
  const out = rec.outputs.find((o) => o.slug === itemSlug);
  return { costs, yield: out?.amount ?? 1 };
}

/** The bought item of a buy recipe = its first non-currency output slug (null if none). */
export function boughtItemSlug(rec: MigRecipe, currencySlug: string): string | null {
  return rec.outputs.find((o) => o.slug !== currencySlug)?.slug ?? null;
}

export interface ConvertResult {
  itemsConverted: number;
  optionsCreated: number;
  buyRecipesDeleted: number;
  sellRecipesDeleted: number;
  itemsSkippedCurated: number;
}

/** Convert Coin Crown trade-recipes into buy options, in one transaction.
 *  - buy recipes (coins in, item out) -> buy-cost + buy-yield EntityLinks on the item,
 *    then the recipe is deleted. Items with lootCurated=true are skipped (their buy
 *    links are community-owned) but their stale buy recipes are still removed.
 *  - sell recipes (item in, coins out) -> deleted (the Value field conveys sell worth).
 *  Idempotent: an item that already has buy-cost rows is not re-converted (its recipes,
 *  if any remain, are still cleaned). */
export async function convertCoinTradesToBuyLinks(
  prisma: PrismaClient,
  opts: { currencySlug: string },
): Promise<ConvertResult> {
  const { currencySlug } = opts;
  return prisma.$transaction(async (tx) => {
    const recipes = await tx.recipe.findMany({
      include: {
        inputs: { include: { entity: { select: { slug: true } } } },
        outputs: { include: { entity: { select: { slug: true } } } },
      },
    });

    const mig: MigRecipe[] = recipes.map((r) => ({
      id: r.id,
      slug: r.slug,
      inputs: r.inputs.map((l) => ({ slug: l.entity.slug, amount: l.amount })),
      outputs: r.outputs.map((l) => ({ slug: l.entity.slug, amount: l.amount })),
    }));

    const buyByItem = new Map<string, ExtractedOption[]>();
    const buyRecipeIds: string[] = [];
    const sellRecipeIds: string[] = [];
    for (const rec of mig) {
      const cls = classifyCoinRecipe(rec, currencySlug);
      if (cls === "sell") { sellRecipeIds.push(rec.id); continue; }
      if (cls !== "buy") continue;
      const itemSlug = boughtItemSlug(rec, currencySlug);
      if (!itemSlug) continue;
      const opt = buyOptionFromRecipe(rec, itemSlug);
      (buyByItem.get(itemSlug) ?? buyByItem.set(itemSlug, []).get(itemSlug)!).push(opt);
      buyRecipeIds.push(rec.id);
    }

    // Resolve item ids (sources/targets) for every slug we touch.
    const slugs = new Set<string>();
    for (const [itemSlug, options] of buyByItem) {
      slugs.add(itemSlug);
      for (const o of options) for (const c of o.costs) slugs.add(c.slug);
    }
    const ents = await tx.entity.findMany({
      where: { slug: { in: [...slugs] } },
      select: { id: true, slug: true, name: true, lootCurated: true },
    });
    const bySlug = new Map(ents.map((e) => [e.slug, e]));

    let itemsConverted = 0, optionsCreated = 0, itemsSkippedCurated = 0;
    for (const [itemSlug, options] of buyByItem) {
      const item = bySlug.get(itemSlug);
      if (!item) continue;
      if (item.lootCurated) { itemsSkippedCurated++; continue; }

      const existing = await tx.entityLink.count({ where: { sourceId: item.id, role: "buy-cost" } });
      if (existing > 0) continue; // idempotent — already converted

      let group = 0;
      const linkRows: {
        sourceId: string; targetId: string | null; role: string; name: string;
        amount: number | null; sortOrder: number; buyGroup: number;
      }[] = [];
      for (const o of options) {
        let sortOrder = 0;
        for (const c of o.costs) {
          const tgt = bySlug.get(c.slug);
          if (!tgt) continue;
          linkRows.push({ sourceId: item.id, targetId: tgt.id, role: "buy-cost", name: tgt.name, amount: c.amount, sortOrder: sortOrder++, buyGroup: group });
        }
        linkRows.push({ sourceId: item.id, targetId: item.id, role: "buy-yield", name: item.name, amount: o.yield, sortOrder: sortOrder++, buyGroup: group });
        group++;
      }
      if (linkRows.length) {
        await tx.entityLink.createMany({ data: linkRows });
        itemsConverted++;
        optionsCreated += options.length;
      }
    }

    if (buyRecipeIds.length) await tx.recipe.deleteMany({ where: { id: { in: buyRecipeIds } } });
    if (sellRecipeIds.length) await tx.recipe.deleteMany({ where: { id: { in: sellRecipeIds } } });

    return {
      itemsConverted, optionsCreated,
      buyRecipesDeleted: buyRecipeIds.length,
      sellRecipesDeleted: sellRecipeIds.length,
      itemsSkippedCurated,
    };
  });
}
