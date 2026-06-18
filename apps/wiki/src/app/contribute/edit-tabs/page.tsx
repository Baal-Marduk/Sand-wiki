import { notFound } from "next/navigation";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { isEditableTarget, entityHref } from "@/lib/proposal-schema";
import { getOutgoingLinks, getItemBySlug, getIncomingLootLinks, listLootSources, getEnvEntityBySlug, getBuyOptionsForEdit } from "@/lib/queries";
import { linksToSnapshot, incomingLootToDrafts } from "@/lib/link-proposal";
import { linkFields, LINK_ROLES, type LinkRole } from "@/lib/entity-links";
import { optionsToDrafts } from "@/lib/buy-options";
import { techNodeOptionLabel } from "@/lib/tech-node-label";
import { LinkEditForm } from "@/components/LinkEditForm";
import { BuyOptionsEditor } from "@/components/BuyOptionsEditor";
import { submitDeleteRecipe, submitItemLootEdit } from "@/app/contribute/actions";
import { btnGhost, btnSecondary, btnDestructive, btnSm } from "@/components/form-styles";

type SP = Promise<{ type?: string; slug?: string }>;

/** Kinds whose pages render item recipe (Crafted-by / Used-in) tabs. Environment
 *  (landmark) crafting is edited via the dedicated `envCraft` section below, not here. */
const RECIPE_TAB_KINDS = new Set(["item"]);

/** Which link roles (if any) this proposal target type edits via the inline editor.
 *  Environment entities edit loot plus the key-progression pair; trampler parts edit
 *  build cost; items use the recipe + "Found in" sections below (no outgoing roles here). */
const ROLES_FOR_TYPE: Record<string, readonly LinkRole[]> = {
  envEntity: ["loot", "requires-key", "rewards-key"],
  tramplerPart: ["cost"],
  item: [],
};

export default async function EditTabsPage({ searchParams }: { searchParams: SP }) {
  const { type = "", slug = "" } = await searchParams;
  if (!isEditableTarget(type) || !slug) notFound();
  await requireUser(`/contribute/edit-tabs?type=${type}&slug=${slug}`);

  const roles = ROLES_FOR_TYPE[type] ?? [];
  const back = entityHref(type, slug);

  // One fetch per editable role (each returns the entity + that role's outgoing links).
  // The first call doubles as the entity lookup; item targets edit no outgoing roles here.
  const baseRole = roles[0] ?? "loot";
  const entity = await getOutgoingLinks(slug, baseRole);
  if (!entity) notFound();
  const rest = await Promise.all(roles.slice(1).map((r) => getOutgoingLinks(slug, r)));
  const linksByRole = new Map<string, typeof entity.outgoingLinks>();
  if (roles.length) linksByRole.set(baseRole, entity.outgoingLinks);
  roles.slice(1).forEach((r, i) => linksByRole.set(r, rest[i]?.outgoingLinks ?? []));

  const items = roles.length
    ? await prisma.entity.findMany({
        where: { kind: "item" },
        select: { slug: true, name: true, rarity: true, icon: true, category: true },
        orderBy: { name: "asc" },
      })
    : [];

  const showRecipes = RECIPE_TAB_KINDS.has(entity.kind);
  const item = showRecipes ? await getItemBySlug(slug) : null;
  const envCraft = entity.kind === "environment" ? await getEnvEntityBySlug(slug) : null;

  const isItem = entity.kind === "item";
  const itemCatalog = isItem
    ? await prisma.entity.findMany({
        where: { kind: "item" },
        select: { slug: true, name: true, rarity: true, icon: true, category: true },
        orderBy: { name: "asc" },
      })
    : items;
  const buyData = isItem ? await getBuyOptionsForEdit(slug) : null;
  const techNodeRows = isItem
    ? await prisma.entity.findMany({
        where: { kind: "tech-node" },
        select: { slug: true, name: true, rarity: true, icon: true, category: true, techNodeStats: { select: { tier: true } } },
        orderBy: { name: "asc" },
      })
    : [];
  // Augment the picker label with tier + letter so duplicate node names (e.g. "Cannon"
  // at several tiers) are distinguishable. The stored/public name is unchanged.
  const techNodes = techNodeRows.map((n) => ({
    slug: n.slug,
    rarity: n.rarity,
    icon: n.icon,
    category: n.category,
    name: techNodeOptionLabel({ name: n.name, slug: n.slug, tier: n.techNodeStats?.tier ?? null }),
  }));
  const lootSources = isItem ? await listLootSources() : [];
  const lootRows = isItem ? await getIncomingLootLinks(slug) : null;
  const lootDrafts = lootRows ? incomingLootToDrafts(lootRows) : [];

  return (
    <article className="mx-auto max-w-3xl space-y-6 py-6">
      <h1 className="font-display text-2xl font-bold uppercase tracking-[0.01em]">Edit tabs — {entity.name}</h1>
      <p className="text-muted-foreground">An admin reviews every change before it goes live.</p>

      {roles.map((r) => {
        const isKeyRole = r === "requires-key" || r === "rewards-key";
        return (
          <section key={r} className="space-y-3 border border-border bg-card p-4">
            <h2 className="font-display text-sm font-semibold uppercase tracking-[0.06em] text-muted-foreground">{LINK_ROLES[r].label}</h2>
            <LinkEditForm
              type={type}
              slug={slug}
              role={r}
              label={LINK_ROLES[r].label}
              fields={linkFields(r)}
              rows={linksToSnapshot(r, linksByRole.get(r) ?? []).rows}
              items={items}
              optionNoun={isKeyRole ? "key" : "item"}
              allowCustom={!isKeyRole}
            />
          </section>
        );
      })}

      {isItem && buyData && (
        <section className="space-y-3 border border-border bg-card p-4">
          <h2 className="font-display text-sm font-semibold uppercase tracking-[0.06em] text-muted-foreground">Buy options</h2>
          <p className="text-sm text-muted-foreground">How this item can be purchased — each option is a price bundle (any items), a yield, and an optional tech-tree unlock.</p>
          <BuyOptionsEditor
            slug={slug}
            rows={optionsToDrafts(buyData.options)}
            items={itemCatalog}
            techNodes={techNodes}
          />
        </section>
      )}

      {isItem && (
        <section className="space-y-3 border border-border bg-card p-4">
          <h2 className="font-display text-sm font-semibold uppercase tracking-[0.06em] text-muted-foreground">Found in</h2>
          <p className="text-sm text-muted-foreground">Containers and landmarks where this item can be looted.</p>
          <LinkEditForm
            type="item"
            slug={slug}
            role="loot"
            label="Found in"
            fields={linkFields("loot")}
            rows={lootDrafts}
            items={lootSources}
            action={submitItemLootEdit}
            optionNoun="source"
            allowCustom={false}
          />
        </section>
      )}

      {showRecipes && item && (
        <>
          {(["craftedBy", "usedIn"] as const).map((key) => {
            const recipes = item[key];
            const side = key === "craftedBy" ? "output" : "input";
            const heading = key === "craftedBy" ? "Crafted by" : "Used in";
            return (
              <section key={key} className="space-y-3 border border-border bg-card p-4">
                <h2 className="font-display text-sm font-semibold uppercase tracking-[0.06em] text-muted-foreground">{heading}</h2>
                {recipes.length === 0 && <p className="text-sm text-muted-foreground">No recipes yet.</p>}
                <ul className="space-y-2">
                  {recipes.map((r) => (
                    <li key={r.slug} className="flex flex-wrap items-center gap-2">
                      <span className="flex-1 text-sm">{r.workbench ?? "Recipe"}{r.tier != null ? ` · T${r.tier}` : ""}</span>
                      <Link href={`/contribute/edit-recipe?slug=${r.slug}`} className={`${btnGhost} ${btnSm}`}>Edit</Link>
                      <form action={submitDeleteRecipe} className="inline">
                        <input type="hidden" name="slug" value={r.slug} />
                        <input type="hidden" name="backType" value={type} />
                        <input type="hidden" name="backSlug" value={slug} />
                        <button type="submit" className={`${btnDestructive} ${btnSm}`}>Delete</button>
                      </form>
                    </li>
                  ))}
                </ul>
                <Link href={`/contribute/new-recipe?type=${type}&slug=${slug}&side=${side}`} className={`${btnSecondary} ${btnSm}`}>
                  + Propose a new recipe that {key === "craftedBy" ? "crafts" : "uses"} this
                </Link>
              </section>
            );
          })}
          <p className="text-sm text-muted-foreground">
            Ammo / Used-by tabs are derived from this item&apos;s ammo &amp; category fields — edit those via &ldquo;Suggest a correction&rdquo;.
          </p>
        </>
      )}

      {envCraft && (
        <section className="space-y-3 border border-border bg-card p-4">
          <h2 className="font-display text-sm font-semibold uppercase tracking-[0.06em] text-muted-foreground">Crafted here</h2>
          {envCraft.craftedBy.length === 0 && <p className="text-sm text-muted-foreground">No recipes yet.</p>}
          <ul className="space-y-2">
            {envCraft.craftedBy.map((r) => (
              <li key={r.slug} className="flex flex-wrap items-center gap-2">
                <span className="flex-1 text-sm">{r.outputs.map((o) => o.name).join(", ") || "Recipe"}</span>
                <Link href={`/contribute/edit-recipe?slug=${r.slug}`} className={`${btnGhost} ${btnSm}`}>Edit</Link>
                <form action={submitDeleteRecipe} className="inline">
                  <input type="hidden" name="slug" value={r.slug} />
                  <input type="hidden" name="backType" value={type} />
                  <input type="hidden" name="backSlug" value={slug} />
                  <button type="submit" className={`${btnDestructive} ${btnSm}`}>Delete</button>
                </form>
              </li>
            ))}
          </ul>
          <Link href={`/contribute/new-recipe?type=${type}&slug=${slug}&location=${slug}`} className={`${btnSecondary} ${btnSm}`}>
            + Propose a new recipe made here
          </Link>
        </section>
      )}

      <Link href={back} className={btnGhost}>Back to page</Link>
    </article>
  );
}
